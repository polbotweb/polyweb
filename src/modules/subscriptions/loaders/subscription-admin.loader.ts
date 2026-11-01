/**
 * Liste back-office du domaine subscriptions (core/filters) : filtres lus dans l'URL
 * canonique de la ressource admin, conditions SQL partagées par la liste et les
 * comptes, facettes calculées par `computeFacets` (Effect, FacetError typé) —
 * chaque facette est comptée avec les autres filtres actifs mais sans le sien,
 * toujours dans le tenant.
 */
import { and, count, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { runOrThrow } from "@/lib/effect/run";
import { subscriptionAdminResource } from "../admin/resource";
import { SUBSCRIPTIONS_STATUSES, type SubscriptionsStatus } from "../domain/workflow";
import { subscriptions } from "../schema";

export interface SubscriptionsAdminFilters {
  readonly search?: string;
  readonly status?: SubscriptionsStatus;
}

/** URL → filtres typés (valeurs hors définition ignorées par parseListUrlState). */
export function subscriptionsAdminFiltersFromUrl(params: URLSearchParams | string): SubscriptionsAdminFilters {
  const { filters } = parseListUrlState(subscriptionAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: SUBSCRIPTIONS_STATUSES.find((status) => status === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);

/** Conditions SQL (tenant + filtres) partagées par la liste, le total et les facettes. */
export function subscriptionsAdminConditions(organizationId: string | null, filters: SubscriptionsAdminFilters): SQL[] {
  const conditions: SQL[] = [organizationId === null ? isNull(subscriptions.organizationId) : eq(subscriptions.organizationId, organizationId)];
  if (filters.search) conditions.push(ilike(subscriptions.title, "%" + escapeLike(filters.search) + "%"));
  if (filters.status) conditions.push(eq(subscriptions.status, filters.status));
  return conditions;
}

/** Comptes de facettes de la liste admin (Effect). */
export const subscriptionsAdminFacets = (organizationId: string | null, filters: SubscriptionsAdminFilters) =>
  computeFacets(filters, [
    {
      id: "status",
      filterKey: "status",
      count: async (without) => {
        const rows = await getDrizzle()
          .select({ value: subscriptions.status, count: count() })
          .from(subscriptions)
          .where(and(...subscriptionsAdminConditions(organizationId, without)))
          .groupBy(subscriptions.status);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    },
  ]);

/** Adaptateur Promise (pages Astro). */
export const loadSubscriptionsAdminFacets = (organizationId: string | null, filters: SubscriptionsAdminFilters) =>
  runOrThrow(subscriptionsAdminFacets(organizationId, filters));
