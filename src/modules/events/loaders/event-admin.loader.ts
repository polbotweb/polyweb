/**
 * Liste back-office du domaine events (core/filters) : filtres lus dans l'URL
 * canonique de la ressource admin, conditions SQL partagées par la liste et les
 * comptes, facettes calculées par `computeFacets` (Effect, FacetError typé) —
 * chaque facette est comptée avec les autres filtres actifs mais sans le sien,
 * toujours dans le tenant.
 */
import { and, count, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { runOrThrow } from "@/lib/effect/run";
import { eventAdminResource } from "../admin/resource";
import { EVENTS_STATUSES, type EventsStatus } from "../domain/workflow";
import { events } from "../schema";

export interface EventsAdminFilters {
  readonly search?: string;
  readonly status?: EventsStatus;
}

/** URL → filtres typés (valeurs hors définition ignorées par parseListUrlState). */
export function eventsAdminFiltersFromUrl(params: URLSearchParams | string): EventsAdminFilters {
  const { filters } = parseListUrlState(eventAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: EVENTS_STATUSES.find((status) => status === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);

/** Conditions SQL (tenant + filtres) partagées par la liste, le total et les facettes. */
export function eventsAdminConditions(organizationId: string | null, filters: EventsAdminFilters): SQL[] {
  const conditions: SQL[] = [organizationId === null ? isNull(events.organizationId) : eq(events.organizationId, organizationId)];
  if (filters.search) conditions.push(ilike(events.title, "%" + escapeLike(filters.search) + "%"));
  if (filters.status) conditions.push(eq(events.status, filters.status));
  return conditions;
}

/** Comptes de facettes de la liste admin (Effect). */
export const eventsAdminFacets = (organizationId: string | null, filters: EventsAdminFilters) =>
  computeFacets(filters, [
    {
      id: "status",
      filterKey: "status",
      count: async (without) => {
        const rows = await getDrizzle()
          .select({ value: events.status, count: count() })
          .from(events)
          .where(and(...eventsAdminConditions(organizationId, without)))
          .groupBy(events.status);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    },
  ]);

/** Adaptateur Promise (pages Astro). */
export const loadEventsAdminFacets = (organizationId: string | null, filters: EventsAdminFilters) =>
  runOrThrow(eventsAdminFacets(organizationId, filters));
