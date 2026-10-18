/**
 * Multi-site (brique j) : résolution du site à partir du nom d'hôte.
 * Les tables de la plateforme (types, entrées, formulaires, tokens, webhooks)
 * sont scopées par site_id. Les tables historiques d'atomic (blog, services,
 * pages, navigation) restent mono-site : voir README (statut partiel).
 */
import { asc, eq, sql } from "drizzle-orm";
import { z } from "astro/zod";
import { getDrizzle, schema } from "@database/drizzle";
import { DEFAULT_SITE_ID } from "@database/schemas/content.schema";
import { LOCALES } from "@i18n/config";

export type Site = typeof schema.sites.$inferSelect;

const CACHE_TTL_MS = 30_000;
let cache: { at: number; sites: Site[] } | null = null;

export function clearSiteCache(): void { cache = null; }

/** Garantit l'existence du site par défaut (ex. après `db:seed --reset`). */
export async function ensureDefaultSite(): Promise<Site> {
  const db = getDrizzle();
  const [existing] = await db.select().from(schema.sites).where(eq(schema.sites.isDefault, true)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(schema.sites)
    .values({ id: DEFAULT_SITE_ID, slug: "default", name: "Site principal", domains: [], isDefault: true })
    .onConflictDoUpdate({ target: schema.sites.id, set: { isDefault: true } })
    .returning();
  clearSiteCache();
  return created!;
}

export async function listSites(): Promise<Site[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.sites;
  const sites = await getDrizzle().select().from(schema.sites).orderBy(asc(schema.sites.createdAt));
  cache = { at: Date.now(), sites };
  return sites;
}

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

export async function resolveSiteForHost(host: string | null | undefined): Promise<Site> {
  const sites = await listSites();
  return pickSiteForHost(sites, host) ?? (await ensureDefaultSite());
}

export async function getSiteById(id: string): Promise<Site | undefined> {
  const [s] = await getDrizzle().select().from(schema.sites).where(eq(schema.sites.id, id));
  return s;
}

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

export class SiteDomainConflictError extends Error {}

async function assertDomainsFree(domains: string[], exceptId?: string) {
  if (domains.length === 0) return;
  const sites = await getDrizzle().select().from(schema.sites);
  for (const s of sites) {
    if (s.id === exceptId) continue;
    const clash = s.domains.find((d) => domains.includes(normalizeHost(d)));
    if (clash) throw new SiteDomainConflictError(`Domaine déjà utilisé par le site "${s.slug}" : ${clash}`);
  }
}

export async function createSite(input: SiteInput): Promise<Site> {
  const data = siteInputSchema.parse(input);
  if (!data.locales.includes(data.defaultLocale)) data.locales.unshift(data.defaultLocale);
  await assertDomainsFree(data.domains);
  const [site] = await getDrizzle().insert(schema.sites).values({ ...data, organizationId: data.organizationId ?? null }).returning();
  clearSiteCache();
  return site!;
}

export async function updateSite(id: string, input: SiteInput): Promise<Site> {
  const data = siteInputSchema.parse(input);
  if (!data.locales.includes(data.defaultLocale)) data.locales.unshift(data.defaultLocale);
  await assertDomainsFree(data.domains, id);
  const [site] = await getDrizzle().update(schema.sites).set({ ...data, organizationId: data.organizationId ?? null }).where(eq(schema.sites.id, id)).returning();
  clearSiteCache();
  if (!site) throw new Error("Site introuvable");
  return site;
}

export async function deleteSite(id: string): Promise<void> {
  const site = await getSiteById(id);
  if (!site) return;
  if (site.isDefault) throw new Error("Le site par défaut ne peut pas être supprimé");
  await getDrizzle().delete(schema.sites).where(eq(schema.sites.id, id));
  clearSiteCache();
}

export async function countSites(): Promise<number> {
  const [r] = await getDrizzle().select({ n: sql<number>`count(*)::int` }).from(schema.sites);
  return r?.n ?? 0;
}
