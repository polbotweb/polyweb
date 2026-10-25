/**
 * Types de contenu définis depuis l'admin (brique b) — schéma dynamique stocké en JSONB.
 * Implémentation Effect (`*Effect`) + adaptateurs Promise (pages admin, tests).
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "astro/zod";
import { Effect, Exit } from "effect";
import { ConflictError, DbError, NotFoundError, ValidationError } from "@/lib/effect/errors";
import { getDrizzle, schema } from "@database/drizzle";
import { fieldListSchema, type FieldDefinition } from "@/core/content-types/fields";
import type { ContentTypeSettings } from "@database/schemas/content.schema";

export type ContentType = typeof schema.contentTypes.$inferSelect;

export const contentTypeInputSchema = z.object({
  slug: z.string().trim().regex(/^[a-z][a-z0-9-]{0,62}$/, "slug : minuscules, chiffres, tirets"),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  fields: z.preprocess((v) => (typeof v === "string" ? JSON.parse(v || "[]") : v), fieldListSchema()),
  settings: z
    .object({
      hasBlocks: z.boolean().default(true),
      publicRead: z.boolean().default(true),
      singleton: z.boolean().default(false),
      icon: z.string().max(40).optional(),
    })
    .default({ hasBlocks: true, publicRead: true, singleton: false }),
});
export type ContentTypeInput = z.input<typeof contentTypeInputSchema>;

export class ContentTypeConflictError extends Error {}

export type ContentTypeError = ConflictError | ValidationError | NotFoundError | DbError;

const dbOp = <A>(operation: string, f: () => Promise<A>) => Effect.tryPromise({ try: f, catch: (cause) => new DbError({ operation, cause }) });

/** Validation de l'entrée ; les erreurs zod sont relevées telles quelles par l'adaptateur Promise. */
const parseInput = (input: ContentTypeInput) =>
  Effect.try({
    try: () => contentTypeInputSchema.parse(input),
    catch: (e) =>
      e instanceof z.ZodError
        ? new ValidationError({ issues: e.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) })
        : new ValidationError({ issues: [{ path: "fields", message: (e as Error).message }] }),
  });

export const listContentTypesEffect = (siteId: string) =>
  dbOp("contentTypes.list", () => getDrizzle().select().from(schema.contentTypes).where(eq(schema.contentTypes.siteId, siteId)).orderBy(asc(schema.contentTypes.name)));

export const getContentTypeEffect = (siteId: string, slugOrId: string) =>
  dbOp("contentTypes.get", () =>
    getDrizzle()
      .select()
      .from(schema.contentTypes)
      .where(and(eq(schema.contentTypes.siteId, siteId), sql`(${schema.contentTypes.slug} = ${slugOrId} OR ${schema.contentTypes.id} = ${slugOrId})`))
      .limit(1),
  ).pipe(Effect.map(([t]): ContentType | undefined => t));

export const createContentTypeEffect = (siteId: string, input: ContentTypeInput) =>
  Effect.gen(function* () {
    const data = yield* parseInput(input);
    if (yield* getContentTypeEffect(siteId, data.slug)) return yield* new ConflictError({ reason: `Le type "${data.slug}" existe déjà` });
    const [row] = yield* dbOp("contentTypes.create", () =>
      getDrizzle()
        .insert(schema.contentTypes)
        .values({ siteId, slug: data.slug, name: data.name, description: data.description ?? null, fields: data.fields as FieldDefinition[], settings: data.settings as ContentTypeSettings })
        .returning(),
    );
    return row!;
  }).pipe(Effect.withSpan("contentTypes.create"));

export const updateContentTypeEffect = (siteId: string, id: string, input: ContentTypeInput) =>
  Effect.gen(function* () {
    const data = yield* parseInput(input);
    const clash = yield* getContentTypeEffect(siteId, data.slug);
    if (clash && clash.id !== id) return yield* new ConflictError({ reason: `Le type "${data.slug}" existe déjà` });
    // Les données existantes des champs supprimés restent en JSONB (non destructif) mais ne sont plus exposées.
    const [row] = yield* dbOp("contentTypes.update", () =>
      getDrizzle()
        .update(schema.contentTypes)
        .set({ slug: data.slug, name: data.name, description: data.description ?? null, fields: data.fields as FieldDefinition[], settings: data.settings as ContentTypeSettings })
        .where(and(eq(schema.contentTypes.id, id), eq(schema.contentTypes.siteId, siteId)))
        .returning(),
    );
    if (!row) return yield* new NotFoundError({ entity: "ContentType", id });
    return row;
  }).pipe(Effect.withSpan("contentTypes.update"));

export const deleteContentTypeEffect = (siteId: string, id: string) =>
  dbOp("contentTypes.delete", () => getDrizzle().delete(schema.contentTypes).where(and(eq(schema.contentTypes.id, id), eq(schema.contentTypes.siteId, siteId)))).pipe(Effect.asVoid);

export const countEntriesByTypeEffect = (siteId: string) =>
  dbOp("contentTypes.count", () =>
    getDrizzle()
      .select({ typeId: schema.contentEntries.typeId, n: sql<number>`count(*)::int` })
      .from(schema.contentEntries)
      .where(eq(schema.contentEntries.siteId, siteId))
      .groupBy(schema.contentEntries.typeId),
  ).pipe(Effect.map((rows): Record<string, number> => Object.fromEntries(rows.map((r) => [r.typeId, r.n]))));

// --- Adaptateurs Promise ------------------------------------------------------

async function run<A>(effect: Effect.Effect<A, ContentTypeError>, raw?: () => unknown): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const fail = exit.cause.reasons.find((r) => r._tag === "Fail");
  if (fail && fail._tag === "Fail") {
    const e = fail.error;
    if (e._tag === "ConflictError") throw new ContentTypeConflictError(e.reason);
    if (e._tag === "ValidationError") raw?.(); // relève l'erreur zod d'origine (les pages affichent ses issues)
    if (e._tag === "DbError") throw e.cause;
    throw new Error(e._tag === "NotFoundError" ? "Type de contenu introuvable" : e.message);
  }
  throw new Error("[content-types] unexpected failure");
}

export const listContentTypes = (siteId: string): Promise<ContentType[]> => run(listContentTypesEffect(siteId));
export const getContentType = (siteId: string, slugOrId: string): Promise<ContentType | undefined> => run(getContentTypeEffect(siteId, slugOrId));
export const createContentType = (siteId: string, input: ContentTypeInput): Promise<ContentType> =>
  run(createContentTypeEffect(siteId, input), () => contentTypeInputSchema.parse(input));
export const updateContentType = (siteId: string, id: string, input: ContentTypeInput): Promise<ContentType> =>
  run(updateContentTypeEffect(siteId, id, input), () => contentTypeInputSchema.parse(input));
export const deleteContentType = (siteId: string, id: string): Promise<void> => run(deleteContentTypeEffect(siteId, id));
export const countEntriesByType = (siteId: string): Promise<Record<string, number>> => run(countEntriesByTypeEffect(siteId));
