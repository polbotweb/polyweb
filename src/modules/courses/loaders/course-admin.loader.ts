/**
 * Liste back-office du domaine courses (core/filters) : filtres lus dans l'URL
 * canonique de la ressource admin, conditions SQL partagées par la liste et les
 * comptes, facettes calculées par `computeFacets` (Effect, FacetError typé) —
 * chaque facette est comptée avec les autres filtres actifs mais sans le sien,
 * toujours dans le tenant.
 */
import { and, count, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { runOrThrow } from "@/lib/effect/run";
import { courseAdminResource } from "../admin/resource";
import { COURSES_STATUSES, type CoursesStatus } from "../domain/workflow";
import { courses } from "../schema";

export interface CoursesAdminFilters {
  readonly search?: string;
  readonly status?: CoursesStatus;
}

/** URL → filtres typés (valeurs hors définition ignorées par parseListUrlState). */
export function coursesAdminFiltersFromUrl(params: URLSearchParams | string): CoursesAdminFilters {
  const { filters } = parseListUrlState(courseAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: COURSES_STATUSES.find((status) => status === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);

/** Conditions SQL (tenant + filtres) partagées par la liste, le total et les facettes. */
export function coursesAdminConditions(organizationId: string | null, filters: CoursesAdminFilters): SQL[] {
  const conditions: SQL[] = [organizationId === null ? isNull(courses.organizationId) : eq(courses.organizationId, organizationId)];
  if (filters.search) conditions.push(ilike(courses.title, "%" + escapeLike(filters.search) + "%"));
  if (filters.status) conditions.push(eq(courses.status, filters.status));
  return conditions;
}

/** Comptes de facettes de la liste admin (Effect). */
export const coursesAdminFacets = (organizationId: string | null, filters: CoursesAdminFilters) =>
  computeFacets(filters, [
    {
      id: "status",
      filterKey: "status",
      count: async (without) => {
        const rows = await getDrizzle()
          .select({ value: courses.status, count: count() })
          .from(courses)
          .where(and(...coursesAdminConditions(organizationId, without)))
          .groupBy(courses.status);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    },
  ]);

/** Adaptateur Promise (pages Astro). */
export const loadCoursesAdminFacets = (organizationId: string | null, filters: CoursesAdminFilters) =>
  runOrThrow(coursesAdminFacets(organizationId, filters));
