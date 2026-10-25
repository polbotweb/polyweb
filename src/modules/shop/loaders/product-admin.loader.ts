/**
 * Liste back-office du domaine shop (core/filters) : filtres lus dans l'URL
 * canonique de la ressource admin, conditions SQL partagées par la liste et les
 * comptes, facettes calculées par `computeFacets` (Effect, FacetError typé) —
 * chaque facette est comptée avec les autres filtres actifs mais sans le sien,
 * toujours dans le tenant.
 */
import { and, count, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { runOrThrow } from "@/lib/effect/run";
import { productAdminResource } from "../admin/resource";
import { SHOP_STATUSES, type ShopStatus } from "../domain/workflow";
import { shop } from "../schema";

export interface ShopAdminFilters {
  readonly search?: string;
  readonly status?: ShopStatus;
}

/** URL → filtres typés (valeurs hors définition ignorées par parseListUrlState). */
export function shopAdminFiltersFromUrl(params: URLSearchParams | string): ShopAdminFilters {
  const { filters } = parseListUrlState(productAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: SHOP_STATUSES.find((status) => status === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);

/** Conditions SQL (tenant + filtres) partagées par la liste, le total et les facettes. */
export function shopAdminConditions(organizationId: string | null, filters: ShopAdminFilters): SQL[] {
  const conditions: SQL[] = [organizationId === null ? isNull(shop.organizationId) : eq(shop.organizationId, organizationId)];
  if (filters.search) conditions.push(ilike(shop.title, "%" + escapeLike(filters.search) + "%"));
  if (filters.status) conditions.push(eq(shop.status, filters.status));
  return conditions;
}

/** Comptes de facettes de la liste admin (Effect). */
export const shopAdminFacets = (organizationId: string | null, filters: ShopAdminFilters) =>
  computeFacets(filters, [
    {
      id: "status",
      filterKey: "status",
      count: async (without) => {
        const rows = await getDrizzle()
          .select({ value: shop.status, count: count() })
          .from(shop)
          .where(and(...shopAdminConditions(organizationId, without)))
          .groupBy(shop.status);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    },
  ]);

/** Adaptateur Promise (pages Astro). */
export const loadShopAdminFacets = (organizationId: string | null, filters: ShopAdminFilters) =>
  runOrThrow(shopAdminFacets(organizationId, filters));
