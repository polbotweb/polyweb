/**
 * Liste back-office des commandes fournisseur (core/filters) : filtres lus dans l'URL canonique,
 * conditions SQL partagées par la liste, le total et les facettes, toujours dans le tenant.
 */
import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { purchaseOrderAdminResource } from "../admin/resource";
import { PURCHASE_ORDER_STATUSES, type PurchaseOrderStatus } from "../domain/workflow";
import { purchasing, purchasingSuppliers } from "../schema";

export interface PurchasingAdminFilters {
  readonly search?: string;
  readonly status?: PurchaseOrderStatus;
}

export function purchasingAdminFiltersFromUrl(params: URLSearchParams | string): PurchasingAdminFilters {
  const { filters } = parseListUrlState(purchaseOrderAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: PURCHASE_ORDER_STATUSES.find((status) => status === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);
const inTenant = (organizationId: string | null) => (organizationId === null ? isNull(purchasing.organizationId) : eq(purchasing.organizationId, organizationId));

export function purchasingAdminConditions(organizationId: string | null, filters: PurchasingAdminFilters): SQL[] {
  const conditions: SQL[] = [inTenant(organizationId)];
  if (filters.search) {
    const pattern = "%" + escapeLike(filters.search) + "%";
    conditions.push(or(ilike(purchasing.title, pattern), ilike(purchasing.number, pattern), ilike(purchasingSuppliers.name, pattern), ilike(purchasingSuppliers.code, pattern))!);
  }
  if (filters.status) conditions.push(eq(purchasing.status, filters.status));
  return conditions;
}

export const purchasingAdminFacets = (organizationId: string | null, filters: PurchasingAdminFilters) =>
  computeFacets(filters, [
    {
      id: "status",
      filterKey: "status",
      count: async (without) => {
        const rows = await getDrizzle()
          .select({ value: purchasing.status, count: count() })
          .from(purchasing)
          .leftJoin(purchasingSuppliers, eq(purchasingSuppliers.id, purchasing.supplierId))
          .where(and(...purchasingAdminConditions(organizationId, without)))
          .groupBy(purchasing.status);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    },
  ]);

export type PurchasingAdminRow = typeof purchasing.$inferSelect & { readonly supplierName: string | null; readonly supplierCode: string | null };

export const purchasingAdminList = (organizationId: string | null, params: URLSearchParams, pageSize = 50) => {
  const state = parseListUrlState(purchaseOrderAdminResource.list!, params);
  const filters = purchasingAdminFiltersFromUrl(params);
  const page = Math.max(1, state.page ?? 1);
  const direction = state.sort?.direction === "asc" ? asc : desc;
  const order =
    state.sort?.id === "number" ? [direction(purchasing.number), desc(purchasing.createdAt)]
      : state.sort?.id === "expectedDate" ? [direction(purchasing.expectedDate), desc(purchasing.createdAt)]
        : [direction(purchasing.createdAt)];
  const where = and(...purchasingAdminConditions(organizationId, filters));
  return dbTry("purchasing.adminList", async () => {
    const db = getDrizzle();
    const [rows, [total]] = await Promise.all([
      db.select({ order: purchasing, supplierName: purchasingSuppliers.name, supplierCode: purchasingSuppliers.code }).from(purchasing).leftJoin(purchasingSuppliers, eq(purchasingSuppliers.id, purchasing.supplierId))
        .where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ value: count() }).from(purchasing).leftJoin(purchasingSuppliers, eq(purchasingSuppliers.id, purchasing.supplierId)).where(where),
    ]);
    const items: PurchasingAdminRow[] = rows.map((row) => ({ ...row.order, supplierName: row.supplierName, supplierCode: row.supplierCode }));
    const totalItems = Number(total?.value ?? 0);
    return { items, page, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)), total: totalItems, filters };
  });
};

export const loadPurchasingAdminFacets = (organizationId: string | null, filters: PurchasingAdminFilters) => runOrThrow(purchasingAdminFacets(organizationId, filters));
