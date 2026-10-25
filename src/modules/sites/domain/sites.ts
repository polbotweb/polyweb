/**
 * Multi-site (brique j) : résolution du site à partir du nom d'hôte.
 * Les tables de la plateforme (types, entrées, formulaires, tokens, webhooks)
 * sont scopées par site_id. Les tables historiques d'atomic (blog, services,
 * pages, navigation) restent mono-site : voir README (statut partiel).
 *
 * Implémentation Effect (`*Effect`, erreurs ConflictError / ValidationError /
 * NotFoundError / DbError) ; les fonctions Promise sont des adaptateurs pour le
 * middleware, les pages et les tests historiques.
 */
import { asc, eq, sql } from "drizzle-orm";
import { z } from "astro/zod";
import { Effect, Exit } from "effect";
import { ConflictError, DbError, NotFoundError, ValidationError } from "@/lib/effect/errors";
import { getDrizzle, schema } from "@database/drizzle";
import { DEFAULT_SITE_ID } from "@database/schemas/content.schema";
import { LOCALES } from "@i18n/config";

export type Site = typeof schema.sites.$inferSelect;

const CACHE_TTL_MS = 30_000;
let cache: { at: number; sites: Site[] } | null = null;

export function clearSiteCache(): void { cache = null; }

export class SiteDomainConflictError extends Error {}

export type SiteError = ConflictError | ValidationError | NotFoundError | DbError;

const dbOp = <A>(operation: string, f: () => Promise<A>) => Effect.tryPromise({ try: f, catch: (cause) => new DbError({ operation, cause }) });
const isUnique = (e: unknown) => {
  const pg = e as { code?: string; cause?: { code?: string } };
  return pg?.code === "23505" || pg?.cause?.code === "23505";
};

export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** Pur : choisit le site correspondant à l'hôte, sinon le site par défaut. */
export function pickSiteForHost(sites: readonly Site[], host: string | null | undefined): Site | undefined {
  const h = normalizeHost(host);
  if (h) {
    const match = sites.find((s) => s.domains.map(normalizeHost).includes(h));
    if (match) return match;
  }
  return sites.find((s) => s.isDefault) ?? sites[0];
}

/** Garantit l'existence du site par défaut (ex. après `db:seed --reset`). */
export const ensureDefaultSiteEffect = Effect.gen(function* () {
  const db = getDrizzle();
  const [existing] = yield* dbOp("sites.default", () => db.select().from(schema.sites).where(eq(schema.sites.isDefault, true)).limit(1));
  if (existing) return existing;
  const [created] = yield* dbOp("sites.default.create", () =>
    db
      .insert(schema.sites)
      .values({ id: DEFAULT_SITE_ID, slug: "default", name: "Site principal", domains: [], isDefault: true })
      .onConflictDoUpdate({ target: schema.sites.id, set: { isDefault: true } })
      .returning(),
  );
  clearSiteCache();
  return created!;
});

/** Liste des sites, mise en cache 30 s (lue à chaque requête par le middleware). */
export const listSitesEffect = Effect.suspend(() =>
  cache && Date.now() - cache.at < CACHE_TTL_MS
    ? Effect.succeed(cache.sites)
    : dbOp("sites.list", () => getDrizzle().select().from(schema.sites).orderBy(asc(schema.sites.createdAt))).pipe(
        Effect.tap((sites) => Effect.sync(() => { cache = { at: Date.now(), sites }; })),
      ),
);

export const resolveSiteForHostEffect = (host: string | null | undefined) =>
  Effect.flatMap(listSitesEffect, (sites) => {
    const picked = pickSiteForHost(sites, host);
    return picked ? Effect.succeed(picked) : ensureDefaultSiteEffect;
  });

export const getSiteByIdEffect = (id: string) =>
  dbOp("sites.get", () => getDrizzle().select().from(schema.sites).where(eq(schema.sites.id, id))).pipe(Effect.map(([s]): Site | undefined => s));

const hostname = z.string().trim().toLowerCase().regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/, "nom d'hôte invalide");

export const siteInputSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "slug invalide"),
  name: z.string().trim().min(1).max(160),
  domains: z.preprocess(
    (v) => (typeof v === "string" ? v.split(/[\s,]+/).filter(Boolean) : v),
    z.array(hostname).max(20),
  ),
  defaultLocale: z.enum(LOCALES).default("fr"),
  locales: z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.enum(LOCALES)).min(1)).default([...LOCALES]),
  organizationId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
});
export type SiteInput = z.input<typeof siteInputSchema>;

const parseSiteInput = (input: SiteInput) => {
  const r = siteInputSchema.safeParse(input);
  if (!r.success) return Effect.fail(new ValidationError({ issues: r.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) }));
  const data = r.data;
  if (!data.locales.includes(data.defaultLocale)) data.locales.unshift(data.defaultLocale);
  return Effect.succeed(data);
};

const assertDomainsFree = (domains: string[], exceptId?: string) =>
  domains.length === 0
    ? Effect.void
    : Effect.flatMap(dbOp("sites.domains", () => getDrizzle().select().from(schema.sites)), (sites) => {
        for (const s of sites) {
          if (s.id === exceptId) continue;
          const clash = s.domains.find((d) => domains.includes(normalizeHost(d)));
          if (clash) return Effect.fail(new ConflictError({ reason: `Domaine déjà utilisé par le site "${s.slug}" : ${clash}` }));
        }
        return Effect.void;
      });

const uniqueSlug = <A, E>(effect: Effect.Effect<A, E | DbError>) =>
  Effect.catchIf(effect, (e): e is DbError => (e as { _tag?: string })._tag === "DbError" && isUnique((e as DbError).cause), () =>
    Effect.fail(new ConflictError({ reason: "Ce slug est déjà utilisé" })),
  );

export const createSiteEffect = (input: SiteInput) =>
  Effect.gen(function* () {
    const data = yield* parseSiteInput(input);
    yield* assertDomainsFree(data.domains);
    const [site] = yield* uniqueSlug(dbOp("sites.create", () => getDrizzle().insert(schema.sites).values({ ...data, organizationId: data.organizationId ?? null }).returning()));
    clearSiteCache();
    return site!;
  }).pipe(Effect.withSpan("sites.create"));

export const updateSiteEffect = (id: string, input: SiteInput) =>
  Effect.gen(function* () {
    const data = yield* parseSiteInput(input);
    yield* assertDomainsFree(data.domains, id);
    const [site] = yield* uniqueSlug(
      dbOp("sites.update", () => getDrizzle().update(schema.sites).set({ ...data, organizationId: data.organizationId ?? null }).where(eq(schema.sites.id, id)).returning()),
    );
    clearSiteCache();
    if (!site) return yield* new NotFoundError({ entity: "site", id });
    return site;
  }).pipe(Effect.withSpan("sites.update"));

export const deleteSiteEffect = (id: string) =>
  Effect.gen(function* () {
    const site = yield* getSiteByIdEffect(id);
    if (!site) return;
    if (site.isDefault) return yield* new ConflictError({ reason: "Le site par défaut ne peut pas être supprimé" });
    yield* dbOp("sites.delete", () => getDrizzle().delete(schema.sites).where(eq(schema.sites.id, id)));
    clearSiteCache();
  }).pipe(Effect.withSpan("sites.delete"));

export const countSitesEffect = dbOp("sites.count", () => getDrizzle().select({ n: sql<number>`count(*)::int` }).from(schema.sites)).pipe(Effect.map(([r]) => r?.n ?? 0));

// --- Adaptateurs Promise ------------------------------------------------------

async function runSites<A>(effect: Effect.Effect<A, SiteError>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const fail = exit.cause.reasons.find((r) => r._tag === "Fail");
  if (fail && fail._tag === "Fail") {
    const e = fail.error;
    if (e._tag === "ConflictError") throw e.reason.startsWith("Domaine") ? new SiteDomainConflictError(e.reason) : new Error(e.reason);
    if (e._tag === "DbError") throw e.cause;
    throw new Error(e._tag === "NotFoundError" ? "Site introuvable" : e.message);
  }
  throw new Error("[sites] unexpected failure");
}

export const ensureDefaultSite = (): Promise<Site> => runSites(ensureDefaultSiteEffect);
export const listSites = (): Promise<Site[]> => runSites(listSitesEffect);
export const resolveSiteForHost = (host: string | null | undefined): Promise<Site> => runSites(resolveSiteForHostEffect(host));
export const getSiteById = (id: string): Promise<Site | undefined> => runSites(getSiteByIdEffect(id));
export const createSite = (input: SiteInput): Promise<Site> => runSites(createSiteEffect(input));
export const updateSite = (id: string, input: SiteInput): Promise<Site> => runSites(updateSiteEffect(id, input));
export const deleteSite = (id: string): Promise<void> => runSites(deleteSiteEffect(id));
export const countSites = (): Promise<number> => runSites(countSitesEffect);
