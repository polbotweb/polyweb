/**
 * Liste back-office des expéditions (core/filters) : filtres lus dans l'URL canonique,
 * conditions SQL partagées par la liste, le total et les facettes, toujours dans le tenant.
 */
import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { shipmentAdminResource } from "../admin/resource";
import { SHIPMENT_STATUSES, type ShipmentStatus } from "../domain/workflow";
import { logistics, logisticsWarehouses } from "../schema";

export interface LogisticsAdminFilters {
  readonly search?: string;
  readonly status?: ShipmentStatus;
}

export function logisticsAdminFiltersFromUrl(params: URLSearchParams | string): LogisticsAdminFilters {
  const { filters } = parseListUrlState(shipmentAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: SHIPMENT_STATUSES.find((status) => status === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);
const inTenant = (organizationId: string | null) => (organizationId === null ? isNull(logistics.organizationId) : eq(logistics.organizationId, organizationId));

export function logisticsAdminConditions(organizationId: string | null, filters: LogisticsAdminFilters): SQL[] {
  const conditions: SQL[] = [inTenant(organizationId)];
  if (filters.search) {
    const pattern = "%" + escapeLike(filters.search) + "%";
    conditions.push(or(ilike(logistics.title, pattern), ilike(logistics.number, pattern), ilike(logistics.recipientName, pattern), ilike(logistics.trackingNumber, pattern))!);
  }
  if (filters.status) conditions.push(eq(logistics.status, filters.status));
  return conditions;
}

export const logisticsAdminFacets = (organizationId: string | null, filters: LogisticsAdminFilters) =>
  computeFacets(filters, [
    {
      id: "status",
      filterKey: "status",
      count: async (without) => {
        const rows = await getDrizzle()
          .select({ value: logistics.status, count: count() })
          .from(logistics)
          .where(and(...logisticsAdminConditions(organizationId, without)))
          .groupBy(logistics.status);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    },
  ]);

export type LogisticsAdminRow = typeof logistics.$inferSelect & { readonly warehouseCode: string | null };

export const logisticsAdminList = (organizationId: string | null, params: URLSearchParams, pageSize = 50) => {
  const state = parseListUrlState(shipmentAdminResource.list!, params);
  const filters = logisticsAdminFiltersFromUrl(params);
  const page = Math.max(1, state.page ?? 1);
  const direction = state.sort?.direction === "asc" ? asc : desc;
  const order =
    state.sort?.id === "number" ? [direction(logistics.number), desc(logistics.createdAt)]
      : state.sort?.id === "shippedAt" ? [direction(logistics.shippedAt), desc(logistics.createdAt)]
        : [direction(logistics.createdAt)];
  const where = and(...logisticsAdminConditions(organizationId, filters));
  return dbTry("logistics.adminList", async () => {
    const db = getDrizzle();
    const [rows, [total]] = await Promise.all([
      db.select({ shipment: logistics, warehouseCode: logisticsWarehouses.code }).from(logistics).leftJoin(logisticsWarehouses, eq(logisticsWarehouses.id, logistics.warehouseId))
        .where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ value: count() }).from(logistics).where(where),
    ]);
    const items: LogisticsAdminRow[] = rows.map((row) => ({ ...row.shipment, warehouseCode: row.warehouseCode }));
    const totalItems = Number(total?.value ?? 0);
    return { items, page, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)), total: totalItems, filters };
  });
};

export const loadLogisticsAdminFacets = (organizationId: string | null, filters: LogisticsAdminFilters) => runOrThrow(logisticsAdminFacets(organizationId, filters));
