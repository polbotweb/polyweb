/**
 * Liste back-office du domaine tax (core/filters) : filtres lus dans l'URL
 * canonique de la ressource admin, conditions SQL partagées par la liste et les
 * comptes, facettes calculées par `computeFacets` (Effect, FacetError typé) —
 * chaque facette est comptée avec les autres filtres actifs mais sans le sien,
 * toujours dans le tenant.
 */
import { and, count, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { runOrThrow } from "@/lib/effect/run";
import { taxRateAdminResource } from "../admin/resource";
import { TAX_STATUSES, type TaxStatus } from "../domain/workflow";
import { tax } from "../schema";

export interface TaxAdminFilters {
  readonly search?: string;
  readonly status?: TaxStatus;
}

/** URL → filtres typés (valeurs hors définition ignorées par parseListUrlState). */
export function taxAdminFiltersFromUrl(params: URLSearchParams | string): TaxAdminFilters {
  const { filters } = parseListUrlState(taxRateAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: TAX_STATUSES.find((status) => status === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);

/** Conditions SQL (tenant + filtres) partagées par la liste, le total et les facettes. */
export function taxAdminConditions(organizationId: string | null, filters: TaxAdminFilters): SQL[] {
  const conditions: SQL[] = [organizationId === null ? isNull(tax.organizationId) : eq(tax.organizationId, organizationId)];
  if (filters.search) conditions.push(ilike(tax.title, "%" + escapeLike(filters.search) + "%"));
  if (filters.status) conditions.push(eq(tax.status, filters.status));
  return conditions;
}

/** Comptes de facettes de la liste admin (Effect). */
export const taxAdminFacets = (organizationId: string | null, filters: TaxAdminFilters) =>
  computeFacets(filters, [
    {
      id: "status",
      filterKey: "status",
      count: async (without) => {
        const rows = await getDrizzle()
          .select({ value: tax.status, count: count() })
          .from(tax)
          .where(and(...taxAdminConditions(organizationId, without)))
          .groupBy(tax.status);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    },
  ]);

/** Adaptateur Promise (pages Astro). */
export const loadTaxAdminFacets = (organizationId: string | null, filters: TaxAdminFilters) =>
  runOrThrow(taxAdminFacets(organizationId, filters));
