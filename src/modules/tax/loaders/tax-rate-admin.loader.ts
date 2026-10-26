/**
 * Liste back-office du domaine tax (core/filters) : filtres lus dans l'URL
 * canonique de la ressource admin, conditions SQL partagées par la liste et les
 * comptes, facettes calculées par `computeFacets` (Effect, FacetError typé) —
 * chaque facette est comptée avec les autres filtres actifs mais sans le sien,
 * toujours dans le tenant.
 */
import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { Effect } from "effect";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { taxRateAdminResource } from "../admin/resource";
import { TAX_STATUSES, type TaxStatus } from "../domain/workflow";
import { EU_COUNTRIES, TAX_CATEGORIES, type TaxCategory } from "../domain/rules";
import { tax } from "../schema";

export interface TaxAdminFilters {
  readonly search?: string;
  readonly status?: TaxStatus;
  readonly country?: string;
  readonly category?: TaxCategory;
}

/** URL → filtres typés (valeurs hors définition ignorées par parseListUrlState). */
export function taxAdminFiltersFromUrl(params: URLSearchParams | string): TaxAdminFilters {
  const { filters } = parseListUrlState(taxRateAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: TAX_STATUSES.find((status) => status === filters.status),
    country: EU_COUNTRIES.find((country) => country === filters.country),
    category: TAX_CATEGORIES.find((category) => category === filters.category),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);

/** Conditions SQL (tenant + filtres) partagées par la liste, le total et les facettes. */
export function taxAdminConditions(organizationId: string | null, filters: TaxAdminFilters): SQL[] {
  const conditions: SQL[] = [organizationId === null ? isNull(tax.organizationId) : eq(tax.organizationId, organizationId)];
  if (filters.search) {
    const pattern = "%" + escapeLike(filters.search) + "%";
    conditions.push(or(ilike(tax.title, pattern), ilike(tax.countryCode, pattern))!);
  }
  if (filters.status) conditions.push(eq(tax.status, filters.status));
  if (filters.country) conditions.push(eq(tax.countryCode, filters.country));
  if (filters.category) conditions.push(eq(tax.category, filters.category));
  return conditions;
}

/** Comptes de facettes de la liste admin (Effect). */
export const taxAdminFacets = (organizationId: string | null, filters: TaxAdminFilters) =>
  computeFacets(filters, [
    { id: "status", filterKey: "status", count: (without) => countBy(organizationId, without, tax.status) },
    { id: "country", filterKey: "country", count: (without) => countBy(organizationId, without, tax.countryCode) },
    { id: "category", filterKey: "category", count: (without) => countBy(organizationId, without, tax.category) },
  ]);

async function countBy(organizationId: string | null, filters: TaxAdminFilters, column: typeof tax.status | typeof tax.countryCode | typeof tax.category) {
  const rows = await getDrizzle()
    .select({ value: column, count: count() })
    .from(tax)
    .where(and(...taxAdminConditions(organizationId, filters)))
    .groupBy(column);
  return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
}

export type TaxRateAdminRow = typeof tax.$inferSelect;

/** Page de la liste admin (tenant + filtres + tri canonique), Effect (DbError typé). */
export const taxAdminList = (organizationId: string | null, params: URLSearchParams, pageSize = 50) => {
  const state = parseListUrlState(taxRateAdminResource.list!, params);
  const filters = taxAdminFiltersFromUrl(params);
  const page = Math.max(1, state.page ?? 1);
  const direction = state.sort?.direction === "asc" ? asc : desc;
  const order = state.sort?.id === "countryCode" ? [direction(tax.countryCode), asc(tax.category)] : [direction(tax.createdAt)];
  const where = and(...taxAdminConditions(organizationId, filters));
  return dbTry("tax.adminList", async () => {
    const db = getDrizzle();
    const [items, [total]] = await Promise.all([
      db.select().from(tax).where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ value: count() }).from(tax).where(where),
    ]);
    const totalItems = Number(total?.value ?? 0);
    return { items, page, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)), total: totalItems, filters };
  });
};

/** Un taux du tenant (null si absent ou hors tenant). */
export const taxAdminById = (id: string, organizationId: string | null) =>
  dbTry("tax.adminById", () =>
    getDrizzle().select().from(tax).where(and(eq(tax.id, id), organizationId === null ? isNull(tax.organizationId) : eq(tax.organizationId, organizationId))).limit(1),
  ).pipe(Effect.map((rows): TaxRateAdminRow | null => rows[0] ?? null));

/** Surcharges actives d'un tenant pour `resolveTaxRate` (statut PUBLISHED uniquement). */
export const taxActiveRates = (organizationId: string | null) =>
  dbTry("tax.activeRates", () =>
    getDrizzle().select().from(tax).where(and(eq(tax.status, "PUBLISHED"), organizationId === null ? isNull(tax.organizationId) : eq(tax.organizationId, organizationId))),
  ).pipe(Effect.map((rows) => rows.map((row) => ({ countryCode: row.countryCode, category: row.category, customerType: row.customerType, ratePercent: row.ratePercent, validFrom: row.validFrom, validTo: row.validTo, organizationId: row.organizationId ?? "platform" }))));

/** Adaptateur Promise (pages Astro). */
export const loadTaxAdminFacets = (organizationId: string | null, filters: TaxAdminFilters) =>
  runOrThrow(taxAdminFacets(organizationId, filters));
