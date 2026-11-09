/**
 * Liste back-office du domaine forums (core/filters) : filtres lus dans l'URL
 * canonique de la ressource admin, conditions SQL partagées par la liste et les
 * comptes, facettes calculées par `computeFacets` (Effect, FacetError typé) —
 * chaque facette est comptée avec les autres filtres actifs mais sans le sien,
 * toujours dans le tenant.
 */
import { and, count, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { runOrThrow } from "@/lib/effect/run";
import { forumAdminResource } from "../admin/resource";
import { FORUMS_STATUSES, type ForumsStatus } from "../domain/workflow";
import { forums } from "../schema";

export interface ForumsAdminFilters {
  readonly search?: string;
  readonly status?: ForumsStatus;
}

/** URL → filtres typés (valeurs hors définition ignorées par parseListUrlState). */
export function forumsAdminFiltersFromUrl(params: URLSearchParams | string): ForumsAdminFilters {
  const { filters } = parseListUrlState(forumAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: FORUMS_STATUSES.find((status) => status === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);

/** Conditions SQL (tenant + filtres) partagées par la liste, le total et les facettes. */
export function forumsAdminConditions(organizationId: string | null, filters: ForumsAdminFilters): SQL[] {
  const conditions: SQL[] = [organizationId === null ? isNull(forums.organizationId) : eq(forums.organizationId, organizationId)];
  if (filters.search) conditions.push(ilike(forums.title, "%" + escapeLike(filters.search) + "%"));
  if (filters.status) conditions.push(eq(forums.status, filters.status));
  return conditions;
}

/** Comptes de facettes de la liste admin (Effect). */
export const forumsAdminFacets = (organizationId: string | null, filters: ForumsAdminFilters) =>
  computeFacets(filters, [
    {
      id: "status",
      filterKey: "status",
      count: async (without) => {
        const rows = await getDrizzle()
          .select({ value: forums.status, count: count() })
          .from(forums)
          .where(and(...forumsAdminConditions(organizationId, without)))
          .groupBy(forums.status);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    },
  ]);

/** Adaptateur Promise (pages Astro). */
export const loadForumsAdminFacets = (organizationId: string | null, filters: ForumsAdminFilters) =>
  runOrThrow(forumsAdminFacets(organizationId, filters));
