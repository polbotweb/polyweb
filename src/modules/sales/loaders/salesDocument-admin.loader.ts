/**
 * Liste back-office du domaine sales (core/filters) : filtres lus dans l'URL
 * canonique de la ressource admin (recherche, type, statut), conditions SQL partagées par
 * la liste et les comptes, facettes calculées par `computeFacets` — chaque facette est
 * comptée avec les autres filtres actifs mais sans le sien, toujours dans le tenant.
 */
import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { salesDocumentAdminResource } from "../admin/resource";
import { SALES_DOCUMENT_KINDS, SALES_STATUSES, type SalesDocumentKind, type SalesStatus } from "../domain/workflow";
import { sales } from "../schema";

export interface SalesAdminFilters {
  readonly search?: string;
  readonly kind?: SalesDocumentKind;
  readonly status?: SalesStatus;
}

/** URL → filtres typés (valeurs hors définition ignorées par parseListUrlState). */
export function salesAdminFiltersFromUrl(params: URLSearchParams | string): SalesAdminFilters {
  const { filters } = parseListUrlState(salesDocumentAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    kind: SALES_DOCUMENT_KINDS.find((kind) => kind === filters.kind),
    status: SALES_STATUSES.find((status) => status === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);

/** Conditions SQL (tenant + filtres) partagées par la liste, le total et les facettes. */
export function salesAdminConditions(organizationId: string | null, filters: SalesAdminFilters): SQL[] {
  const conditions: SQL[] = [organizationId === null ? isNull(sales.organizationId) : eq(sales.organizationId, organizationId)];
  if (filters.search) {
    const pattern = "%" + escapeLike(filters.search) + "%";
    conditions.push(or(ilike(sales.title, pattern), ilike(sales.customerName, pattern), ilike(sales.number, pattern))!);
  }
  if (filters.kind) conditions.push(eq(sales.kind, filters.kind));
  if (filters.status) conditions.push(eq(sales.status, filters.status));
  return conditions;
}

async function countBy(organizationId: string | null, filters: SalesAdminFilters, column: PgColumn) {
  const rows = await getDrizzle()
    .select({ value: column, count: count() })
    .from(sales)
    .where(and(...salesAdminConditions(organizationId, filters)))
    .groupBy(column);
  return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
}

/** Comptes de facettes de la liste admin (Effect). */
export const salesAdminFacets = (organizationId: string | null, filters: SalesAdminFilters) =>
  computeFacets(filters, [
    { id: "kind", filterKey: "kind", count: (without) => countBy(organizationId, without, sales.kind) },
    { id: "status", filterKey: "status", count: (without) => countBy(organizationId, without, sales.status) },
  ]);

export type SalesAdminRow = typeof sales.$inferSelect;

/** Page de la liste admin (tenant + filtres + tri canonique), Effect (DbError typé). */
export const salesAdminList = (organizationId: string | null, params: URLSearchParams, pageSize = 50) => {
  const state = parseListUrlState(salesDocumentAdminResource.list!, params);
  const filters = salesAdminFiltersFromUrl(params);
  const page = Math.max(1, state.page ?? 1);
  const direction = state.sort?.direction === "asc" ? asc : desc;
  const order = state.sort?.id === "number" ? [direction(sales.number), desc(sales.createdAt)] : [direction(sales.createdAt)];
  const where = and(...salesAdminConditions(organizationId, filters));
  return dbTry("sales.adminList", async () => {
    const db = getDrizzle();
    const [items, [total]] = await Promise.all([
      db.select().from(sales).where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ value: count() }).from(sales).where(where),
    ]);
    const totalItems = Number(total?.value ?? 0);
    return { items, page, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)), total: totalItems, filters };
  });
};

/** Adaptateur Promise (pages Astro). */
export const loadSalesAdminFacets = (organizationId: string | null, filters: SalesAdminFilters) =>
  runOrThrow(salesAdminFacets(organizationId, filters));
