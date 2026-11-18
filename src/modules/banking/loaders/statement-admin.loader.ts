/**
 * Liste back-office du domaine banking (core/filters) : filtres lus dans l'URL
 * canonique de la ressource admin, conditions SQL partagées par la liste et les
 * comptes, facettes calculées par `computeFacets` (Effect, FacetError typé) —
 * chaque facette est comptée avec les autres filtres actifs mais sans le sien,
 * toujours dans le tenant.
 */
import { and, count, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { runOrThrow } from "@/lib/effect/run";
import { statementAdminResource } from "../admin/resource";
import { BANKING_STATUSES, type BankingStatus } from "../domain/workflow";
import { banking } from "../schema";

export interface BankingAdminFilters {
  readonly search?: string;
  readonly status?: BankingStatus;
}

/** URL → filtres typés (valeurs hors définition ignorées par parseListUrlState). */
export function bankingAdminFiltersFromUrl(params: URLSearchParams | string): BankingAdminFilters {
  const { filters } = parseListUrlState(statementAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: BANKING_STATUSES.find((status) => status === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);

/** Conditions SQL (tenant + filtres) partagées par la liste, le total et les facettes. */
export function bankingAdminConditions(organizationId: string | null, filters: BankingAdminFilters): SQL[] {
  const conditions: SQL[] = [organizationId === null ? isNull(banking.organizationId) : eq(banking.organizationId, organizationId)];
  if (filters.search) conditions.push(ilike(banking.title, "%" + escapeLike(filters.search) + "%"));
  if (filters.status) conditions.push(eq(banking.status, filters.status));
  return conditions;
}

/** Comptes de facettes de la liste admin (Effect). */
export const bankingAdminFacets = (organizationId: string | null, filters: BankingAdminFilters) =>
  computeFacets(filters, [
    {
      id: "status",
      filterKey: "status",
      count: async (without) => {
        const rows = await getDrizzle()
          .select({ value: banking.status, count: count() })
          .from(banking)
          .where(and(...bankingAdminConditions(organizationId, without)))
          .groupBy(banking.status);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    },
  ]);

/** Adaptateur Promise (pages Astro). */
export const loadBankingAdminFacets = (organizationId: string | null, filters: BankingAdminFilters) =>
  runOrThrow(bankingAdminFacets(organizationId, filters));
