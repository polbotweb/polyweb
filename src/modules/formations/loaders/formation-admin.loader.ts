/**
 * Liste back-office du domaine formations (core/filters) : filtres lus dans l'URL
 * canonique de la ressource admin, conditions SQL partagées par la liste et les
 * comptes, facettes calculées par `computeFacets` (Effect, FacetError typé) —
 * chaque facette est comptée avec les autres filtres actifs mais sans le sien,
 * toujours dans le tenant.
 */
import { and, count, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { runOrThrow } from "@/lib/effect/run";
import { formationAdminResource } from "../admin/resource";
import { FORMATIONS_STATUSES, type FormationsStatus } from "../domain/workflow";
import { formations } from "../schema";

export interface FormationsAdminFilters {
  readonly search?: string;
  readonly status?: FormationsStatus;
}

/** URL → filtres typés (valeurs hors définition ignorées par parseListUrlState). */
export function formationsAdminFiltersFromUrl(params: URLSearchParams | string): FormationsAdminFilters {
  const { filters } = parseListUrlState(formationAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: FORMATIONS_STATUSES.find((status) => status === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);

/** Conditions SQL (tenant + filtres) partagées par la liste, le total et les facettes. */
export function formationsAdminConditions(organizationId: string | null, filters: FormationsAdminFilters): SQL[] {
  const conditions: SQL[] = [organizationId === null ? isNull(formations.organizationId) : eq(formations.organizationId, organizationId)];
  if (filters.search) conditions.push(ilike(formations.title, "%" + escapeLike(filters.search) + "%"));
  if (filters.status) conditions.push(eq(formations.status, filters.status));
  return conditions;
}

/** Comptes de facettes de la liste admin (Effect). */
export const formationsAdminFacets = (organizationId: string | null, filters: FormationsAdminFilters) =>
  computeFacets(filters, [
    {
      id: "status",
      filterKey: "status",
      count: async (without) => {
        const rows = await getDrizzle()
          .select({ value: formations.status, count: count() })
          .from(formations)
          .where(and(...formationsAdminConditions(organizationId, without)))
          .groupBy(formations.status);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    },
  ]);

/** Adaptateur Promise (pages Astro). */
export const loadFormationsAdminFacets = (organizationId: string | null, filters: FormationsAdminFilters) =>
  runOrThrow(formationsAdminFacets(organizationId, filters));
