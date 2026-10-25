/**
 * Entrées de contenu (brique b) : données validées par la définition du type,
 * traductions par locale, blocs typés (brique a), révisions (brique f),
 * événements content.* (consommés par webhooks, recherche, plugins).
 *
 * Implémentation native Effect (`*Effect`, erreurs typées ValidationError /
 * ConflictError / NotFoundError / DbError). Les fonctions Promise historiques
 * (`createEntry`, …) sont des adaptateurs qui relèvent les classes d'erreur
 * historiques (`EntryValidationError`, …) pour les pages Astro et tests existants.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "astro/zod";
import { getDrizzle, schema } from "@database/drizzle";
import { buildDataSchema } from "@/core/content-types/fields";
import { parseBlocksDocument, type BlocksDocument } from "@/core/blocks/registry";
import { Effect, Exit } from "effect";
import { emitEventEffect } from "@/core/events";
import { ConflictError, DbError, NotFoundError, ValidationError } from "@/lib/effect/errors";
import type { ContentStatus, EntrySeo, EntrySnapshot } from "@database/schemas/content.schema";
import type { ContentType } from "./content-types";

export type Entry = typeof schema.contentEntries.$inferSelect;
export type EntryTranslation = typeof schema.contentEntryTranslations.$inferSelect;
export interface FullEntry extends Entry { translations: EntryTranslation[]; type: ContentType }

export class EntryValidationError extends Error {
  constructor(public readonly errors: Record<string, string>) {
    super(`Entrée invalide : ${Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join("; ")}`);
  }
}
export class EntryConflictError extends Error {}
export class EntryNotFoundError extends Error {}

export const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug : minuscules, chiffres et tirets").max(200);

export function slugify(input: string): string {
  return input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 200) || "entree";
}

export interface TranslationInput { title: string; data?: Record<string, unknown>; blocks?: unknown; seo?: EntrySeo }
export interface SaveEntryInput {
  slug?: string;
  sharedData?: Record<string, unknown>;
  translations: Record<string, TranslationInput>;
  message?: string;
}

const seoSchema = z.object({
  metaTitle: z.string().trim().max(160).optional(),
  metaDescription: z.string().trim().max(320).optional(),
  ogImage: z.string().trim().max(2000).optional(),
  noindex: z.boolean().optional(),
}).partial();

function prefix(errors: Record<string, string>, p: string, issues: z.ZodError["issues"]) {
  for (const i of issues) errors[`${p}${i.path.join(".")}`] ??= i.message;
}

/** Validation pure (testable sans base) des données d'une entrée pour un type donné. */
export function validateEntryInput(type: Pick<ContentType, "fields" | "settings">, input: SaveEntryInput, allowedLocales: readonly string[]) {
  const errors: Record<string, string> = {};
  const shared = buildDataSchema(type.fields, "shared").safeParse(input.sharedData ?? {});
  if (!shared.success) prefix(errors, "shared.", shared.error.issues);
  const localizedSchema = buildDataSchema(type.fields, "localized");
  const translations: Array<{ locale: string; title: string; data: Record<string, unknown>; blocks: BlocksDocument | null; seo: EntrySeo }> = [];
  const locales = Object.keys(input.translations ?? {});
  if (locales.length === 0) errors.translations = "au moins une traduction est requise";
  for (const locale of locales) {
    if (!allowedLocales.includes(locale)) { errors[`${locale}`] = `locale non autorisée : ${locale}`; continue; }
    const t = input.translations[locale]!;
    const title = (t.title ?? "").trim();
    if (!title) errors[`${locale}.title`] = "titre requis";
    else if (title.length > 300) errors[`${locale}.title`] = "300 caractères max";
    const data = localizedSchema.safeParse(t.data ?? {});
    if (!data.success) prefix(errors, `${locale}.`, data.error.issues);
    const seo = seoSchema.safeParse(t.seo ?? {});
    if (!seo.success) prefix(errors, `${locale}.seo.`, seo.error.issues);
    let blocks: BlocksDocument | null = null;
    if (type.settings.hasBlocks !== false && t.blocks !== undefined && t.blocks !== null && t.blocks !== "") {
      try { blocks = parseBlocksDocument(t.blocks); } catch (e) { errors[`${locale}.blocks`] = (e as Error).message; }
    }
    if (data.success && seo.success) translations.push({ locale, title, data: data.data, blocks, seo: seo.data });
  }
  if (input.slug !== undefined) {
    const s = slugSchema.safeParse(input.slug);
    if (!s.success) errors.slug = s.error.issues[0]!.message;
  }
  if (Object.keys(errors).length) throw new EntryValidationError(errors);
  return { sharedData: shared.success ? shared.data : {}, translations };
}

function snapshotOf(entry: Entry, translations: EntryTranslation[]): EntrySnapshot {
  return {
    slug: entry.slug,
    status: entry.status,
    sharedData: entry.sharedData,
    translations: translations
      .map((t) => ({ locale: t.locale, title: t.title, data: t.data, blocks: t.blocks ?? null, seo: t.seo }))
      .sort((a, b) => a.locale.localeCompare(b.locale)),
  };
}

type Tx = Parameters<Parameters<ReturnType<typeof getDrizzle>["transaction"]>[0]>[0];

async function writeRevision(tx: Tx, entry: Entry, authorId: string | null, message?: string) {
  const translations = await tx.select().from(schema.contentEntryTranslations).where(eq(schema.contentEntryTranslations.entryId, entry.id));
  await tx.insert(schema.contentEntryRevisions).values({ entryId: entry.id, version: entry.version, snapshot: snapshotOf(entry, translations), authorId, message: message?.slice(0, 300) ?? null });
}

async function upsertTranslations(tx: Tx, entryId: string, translations: ReturnType<typeof validateEntryInput>["translations"]) {
  for (const t of translations) {
    await tx
      .insert(schema.contentEntryTranslations)
      .values({ entryId, locale: t.locale, title: t.title, data: t.data, blocks: t.blocks, seo: t.seo })
      .onConflictDoUpdate({
        target: [schema.contentEntryTranslations.entryId, schema.contentEntryTranslations.locale],
        set: { title: t.title, data: t.data, blocks: t.blocks, seo: t.seo, updatedAt: new Date() },
      });
  }
}

function isUniqueViolation(e: unknown) {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

export type ContentError = ValidationError | ConflictError | NotFoundError | DbError;

const db = (operation: string) => <A>(f: () => Promise<A>) =>
  Effect.tryPromise({ try: f, catch: (cause) => new DbError({ operation, cause }) });

/** Une transaction peut échouer par un `ContentError` levé à l'intérieur (cf. `throwTyped`) : on le restitue tel quel. */
const transact = <A>(operation: string, f: (tx: Tx) => Promise<A>, uniqueMessage?: string) =>
  Effect.tryPromise({
    try: () => getDrizzle().transaction(f),
    catch: (cause): ContentError =>
      cause instanceof ValidationError || cause instanceof ConflictError || cause instanceof NotFoundError
        ? cause
        : uniqueMessage && isUniqueViolation(cause)
          ? new ConflictError({ reason: uniqueMessage })
          : new DbError({ operation, cause }),
  });

const toValidationError = (errors: Record<string, string>) =>
  new ValidationError({ issues: Object.entries(errors).map(([path, message]) => ({ path, message })) });

/** Validation en Effect (erreur typée `ValidationError`). */
export const validateEntryEffect = (type: Pick<ContentType, "fields" | "settings">, input: SaveEntryInput, allowedLocales: readonly string[]) =>
  Effect.try({
    try: () => validateEntryInput(type, input, allowedLocales),
    catch: (e) => (e instanceof EntryValidationError ? toValidationError(e.errors) : toValidationError({ _: (e as Error).message })),
  });

const parseSlug = (slug: string) => {
  const r = slugSchema.safeParse(slug);
  return r.success ? Effect.succeed(r.data) : Effect.fail(toValidationError({ slug: r.error.issues[0]!.message }));
};

export const createEntryEffect = (type: ContentType, input: SaveEntryInput, opts: { authorId: string | null; allowedLocales: readonly string[] }) =>
  Effect.gen(function* () {
    const valid = yield* validateEntryEffect(type, input, opts.allowedLocales);
    const slug = input.slug?.trim() ? yield* parseSlug(input.slug) : slugify(valid.translations[0]!.title);
    if (type.settings.singleton) {
      const [existing] = yield* db("entries.singleton")(() =>
        getDrizzle().select({ id: schema.contentEntries.id }).from(schema.contentEntries).where(eq(schema.contentEntries.typeId, type.id)).limit(1),
      );
      if (existing) return yield* new ConflictError({ reason: "Ce type est un singleton : une entrée existe déjà" });
    }
    const entry = yield* transact(
      "entries.create",
      async (tx) => {
        const [e] = await tx.insert(schema.contentEntries).values({ siteId: type.siteId, typeId: type.id, slug, sharedData: valid.sharedData, authorId: opts.authorId, version: 1 }).returning();
        await upsertTranslations(tx, e!.id, valid.translations);
        await writeRevision(tx, e!, opts.authorId, input.message ?? "Création");
        return e!;
      },
      `Le slug "${slug}" est déjà utilisé pour ce type`,
    );
    yield* emitEventEffect("content.created", { entryId: entry.id, type: type.slug, slug: entry.slug, status: entry.status }, { siteId: type.siteId });
    return entry;
  }).pipe(Effect.withSpan("content.create"));

export const updateEntryEffect = (
  type: ContentType,
  entryId: string,
  input: SaveEntryInput,
  opts: { authorId: string | null; allowedLocales: readonly string[]; expectedVersion?: number },
) =>
  Effect.gen(function* () {
    const valid = yield* validateEntryEffect(type, input, opts.allowedLocales);
    const newSlug = input.slug?.trim() ? yield* parseSlug(input.slug) : undefined;
    const entry = yield* transact(
      "entries.update",
      async (tx) => {
        const [current] = await tx.select().from(schema.contentEntries).where(and(eq(schema.contentEntries.id, entryId), eq(schema.contentEntries.typeId, type.id))).for("update");
        if (!current) throw new NotFoundError({ entity: "Entry", id: entryId });
        if (opts.expectedVersion !== undefined && opts.expectedVersion !== current.version) {
          throw new ConflictError({ reason: `Conflit d'édition : version ${current.version} en base, ${opts.expectedVersion} attendue` });
        }
        const [e] = await tx
          .update(schema.contentEntries)
          .set({ slug: newSlug ?? current.slug, sharedData: { ...current.sharedData, ...valid.sharedData }, version: current.version + 1 })
          .where(eq(schema.contentEntries.id, entryId))
          .returning();
        await upsertTranslations(tx, entryId, valid.translations);
        await writeRevision(tx, e!, opts.authorId, input.message);
        return e!;
      },
      "Ce slug est déjà utilisé pour ce type",
    );
    yield* emitEventEffect("content.updated", { entryId: entry.id, type: type.slug, slug: entry.slug, status: entry.status, version: entry.version }, { siteId: type.siteId });
    return entry;
  }).pipe(Effect.withSpan("content.update"));

export const setEntryStatusEffect = (type: ContentType, entryId: string, status: ContentStatus, authorId: string | null) =>
  Effect.gen(function* () {
    const entry = yield* transact("entries.setStatus", async (tx) => {
      const [current] = await tx.select().from(schema.contentEntries).where(and(eq(schema.contentEntries.id, entryId), eq(schema.contentEntries.typeId, type.id))).for("update");
      if (!current) throw new NotFoundError({ entity: "Entry", id: entryId });
      const [e] = await tx
        .update(schema.contentEntries)
        .set({ status, version: current.version + 1, publishedAt: status === "published" ? current.publishedAt ?? new Date() : current.publishedAt })
        .where(eq(schema.contentEntries.id, entryId))
        .returning();
      await writeRevision(tx, e!, authorId, status === "published" ? "Publication" : status === "archived" ? "Archivage" : "Dépublication");
      return { before: current.status, after: e! };
    });
    if (status === "published") yield* emitEventEffect("content.published", { entryId, type: type.slug, slug: entry.after.slug }, { siteId: type.siteId });
    else if (entry.before === "published") yield* emitEventEffect("content.unpublished", { entryId, type: type.slug, slug: entry.after.slug, status }, { siteId: type.siteId });
    return entry.after;
  }).pipe(Effect.withSpan("content.setStatus"));

/** Supprime l'entrée ; `false` si elle n'existait pas. */
export const deleteEntryEffect = (type: ContentType, entryId: string) =>
  Effect.gen(function* () {
    const [deleted] = yield* db("entries.delete")(() =>
      getDrizzle().delete(schema.contentEntries).where(and(eq(schema.contentEntries.id, entryId), eq(schema.contentEntries.typeId, type.id))).returning(),
    );
    if (deleted) yield* emitEventEffect("content.deleted", { entryId, type: type.slug, slug: deleted.slug }, { siteId: type.siteId });
    return Boolean(deleted);
  }).pipe(Effect.withSpan("content.delete"));

const withTranslations = (e: Entry | undefined, type: ContentType, ordered = false) =>
  e
    ? db("entries.translations")(() =>
        ordered
          ? getDrizzle().select().from(schema.contentEntryTranslations).where(eq(schema.contentEntryTranslations.entryId, e.id)).orderBy(asc(schema.contentEntryTranslations.locale))
          : getDrizzle().select().from(schema.contentEntryTranslations).where(eq(schema.contentEntryTranslations.entryId, e.id)),
      ).pipe(Effect.map((translations): FullEntry | undefined => ({ ...e, translations, type })))
    : Effect.succeed(undefined);

export const getEntryEffect = (type: ContentType, entryId: string) =>
  db("entries.get")(() => getDrizzle().select().from(schema.contentEntries).where(and(eq(schema.contentEntries.id, entryId), eq(schema.contentEntries.typeId, type.id)))).pipe(
    Effect.flatMap(([e]) => withTranslations(e, type, true)),
  );

export const getEntryByIdEffect = (entryId: string) =>
  Effect.gen(function* () {
    const [row] = yield* db("entries.getById")(() =>
      getDrizzle().select().from(schema.contentEntries).innerJoin(schema.contentTypes, eq(schema.contentTypes.id, schema.contentEntries.typeId)).where(eq(schema.contentEntries.id, entryId)),
    );
    if (!row) return undefined;
    return yield* withTranslations(row.content_entries, row.content_types);
  });

export interface ListOptions { status?: ContentStatus | "any"; limit?: number; offset?: number; locale?: string; search?: string; order?: "newest" | "oldest" | "title" }

export const listEntriesEffect = (type: ContentType, opts: ListOptions = {}) =>
  Effect.gen(function* () {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const conds = [eq(schema.contentEntries.typeId, type.id)];
    if (opts.status && opts.status !== "any") conds.push(eq(schema.contentEntries.status, opts.status));
    if (opts.search?.trim()) {
      conds.push(sql`exists (select 1 from ${schema.contentEntryTranslations} t where t.entry_id = ${schema.contentEntries.id} and t.title ilike ${`%${opts.search.trim().replace(/[%_\\]/g, "\\$&")}%`})`);
    }
    const where = and(...conds);
    const order = opts.order === "oldest" ? asc(schema.contentEntries.createdAt) : opts.status === "published" ? desc(schema.contentEntries.publishedAt) : desc(schema.contentEntries.updatedAt);
    const [rows, [count]] = yield* Effect.all(
      [
        db("entries.list")(() => getDrizzle().select().from(schema.contentEntries).where(where).orderBy(order).limit(limit).offset(offset)),
        db("entries.count")(() => getDrizzle().select({ n: sql<number>`count(*)::int` }).from(schema.contentEntries).where(where)),
      ],
      { concurrency: 2 },
    );
    const ids = rows.map((r) => r.id);
    const translations = ids.length
      ? yield* db("entries.translations")(() => getDrizzle().select().from(schema.contentEntryTranslations).where(inArray(schema.contentEntryTranslations.entryId, ids)))
      : [];
    return {
      items: rows.map((r): FullEntry => ({ ...r, type, translations: translations.filter((t) => t.entryId === r.id) })),
      total: count?.n ?? 0,
    };
  });

export const getEntryBySlugEffect = (type: ContentType, slug: string, opts: { publishedOnly?: boolean } = {}) =>
  db("entries.bySlug")(() =>
    getDrizzle()
      .select()
      .from(schema.contentEntries)
      .where(and(eq(schema.contentEntries.typeId, type.id), eq(schema.contentEntries.slug, slug), opts.publishedOnly ? eq(schema.contentEntries.status, "published") : undefined)),
  ).pipe(Effect.flatMap(([e]) => withTranslations(e, type)));

// ---------------------------------------------------------------------------
// Adaptateurs Promise (pages Astro / tests historiques)
// ---------------------------------------------------------------------------

/** Exécute un Effect du domaine contenu et relève les classes d'erreur historiques. */
export async function runContent<A>(effect: Effect.Effect<A, ContentError>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const fail = exit.cause.reasons.find((r) => r._tag === "Fail");
  if (fail && fail._tag === "Fail") {
    const e = fail.error;
    switch (e._tag) {
      case "ValidationError":
        throw new EntryValidationError(Object.fromEntries(e.issues.map((i) => [i.path, i.message])));
      case "ConflictError":
        throw new EntryConflictError(e.reason);
      case "NotFoundError":
        throw new EntryNotFoundError(e.entity === "Entry" ? "Entrée introuvable" : e.entity === "Revision" ? "Révision introuvable" : e.message);
      case "DbError":
        throw e.cause;
    }
  }
  throw new Error("[entries] unexpected failure");
}

export const createEntry = (type: ContentType, input: SaveEntryInput, opts: { authorId: string | null; allowedLocales: readonly string[] }): Promise<Entry> =>
  runContent(createEntryEffect(type, input, opts));
export const updateEntry = (type: ContentType, entryId: string, input: SaveEntryInput, opts: { authorId: string | null; allowedLocales: readonly string[]; expectedVersion?: number }): Promise<Entry> =>
  runContent(updateEntryEffect(type, entryId, input, opts));
export const setEntryStatus = (type: ContentType, entryId: string, status: ContentStatus, authorId: string | null): Promise<Entry> =>
  runContent(setEntryStatusEffect(type, entryId, status, authorId));
export const deleteEntry = (type: ContentType, entryId: string): Promise<void> => runContent(deleteEntryEffect(type, entryId)).then(() => undefined);
export const getEntry = (type: ContentType, entryId: string): Promise<FullEntry | undefined> => runContent(getEntryEffect(type, entryId));
export const getEntryById = (entryId: string): Promise<FullEntry | undefined> => runContent(getEntryByIdEffect(entryId));
export const listEntries = (type: ContentType, opts: ListOptions = {}): Promise<{ items: FullEntry[]; total: number }> => runContent(listEntriesEffect(type, opts));
export const getPublishedEntryBySlug = (type: ContentType, slug: string): Promise<FullEntry | undefined> => runContent(getEntryBySlugEffect(type, slug, { publishedOnly: true }));
export const getEntryBySlug = (type: ContentType, slug: string): Promise<FullEntry | undefined> => runContent(getEntryBySlugEffect(type, slug));

/** Traduction pour une locale avec repli sur la locale par défaut puis la première disponible. */
export function pickTranslation(entry: Pick<FullEntry, "translations">, locale: string, fallback = "fr"): EntryTranslation | undefined {
  return entry.translations.find((t) => t.locale === locale) ?? entry.translations.find((t) => t.locale === fallback) ?? entry.translations[0];
}
