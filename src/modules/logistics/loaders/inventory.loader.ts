/**
 * Lectures logistics « traçabilité » (back-office) : grand livre de stock filtrable et paginé,
 * inventaires et leurs lignes. Bornées au tenant.
 */
import { Effect } from "effect";
import { aliasedTable, and, asc, count, desc, eq, gte, isNull, like, lt, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { user } from "@database/schemas/auth.schema";
import { logisticsInventoryCountLines, logisticsInventoryCounts, logisticsItems, logisticsStockMovements, logisticsWarehouses } from "../schema";
import { isUuid, LEDGER_PAGE_SIZE, ledgerDateRange, likePrefix, type LedgerFilters } from "../domain/ledger";
import type { InventoryCountStatus } from "../domain/inventory";

type Movement = typeof logisticsStockMovements.$inferSelect;
type Count = typeof logisticsInventoryCounts.$inferSelect;
type CountLine = typeof logisticsInventoryCountLines.$inferSelect;

export type LedgerRow = Movement & { readonly sku: string; readonly itemName: string; readonly warehouseCode: string; readonly userName: string | null; readonly inventoryNumber: string | null };
export interface LedgerPage {
  readonly rows: readonly LedgerRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pages: number;
}
export type InventoryCountListRow = Count & { readonly warehouseCode: string; readonly lines: number; readonly counted: number; readonly discrepancies: number };
export type InventoryCountDetail = Count & {
  readonly warehouseCode: string;
  readonly warehouseName: string;
  readonly createdByName: string | null;
  readonly validatedByName: string | null;
  readonly lines: readonly (CountLine & { readonly itemName: string })[];
};

const tenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));

const ledgerWhere = (organizationId: string | null, filters: LedgerFilters) => {
  const { start, end } = ledgerDateRange(filters);
  return and(
    tenant(logisticsStockMovements.organizationId, organizationId),
    filters.warehouseId ? eq(logisticsStockMovements.warehouseId, filters.warehouseId) : undefined,
    filters.sku ? like(logisticsItems.sku, likePrefix(filters.sku)) : undefined,
    filters.kind ? eq(logisticsStockMovements.kind, filters.kind) : undefined,
    filters.source ? eq(logisticsStockMovements.source, filters.source) : undefined,
    filters.userId ? eq(logisticsStockMovements.createdBy, filters.userId) : undefined,
    start ? gte(logisticsStockMovements.createdAt, start) : undefined,
    end ? lt(logisticsStockMovements.createdAt, end) : undefined,
  );
};

export const inventoryLoader = {
  /** Grand livre filtré (plus récent d'abord, ordre stable), paginé. */
  ledger: (organizationId: string | null, filters: LedgerFilters, pageSize = LEDGER_PAGE_SIZE) =>
    Effect.gen(function* () {
      const db = getDrizzle();
      const where = ledgerWhere(organizationId, filters);
      const [totalRow] = yield* dbTry("logistics.ledger.count", () =>
        db.select({ total: count() }).from(logisticsStockMovements).innerJoin(logisticsItems, eq(logisticsItems.id, logisticsStockMovements.itemId)).where(where));
      const total = Number(totalRow?.total ?? 0);
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(filters.page, pages);
      const rows = yield* dbTry("logistics.ledger.rows", () =>
        db.select({
          movement: logisticsStockMovements, sku: logisticsItems.sku, itemName: logisticsItems.name, warehouseCode: logisticsWarehouses.code,
          userName: user.name, inventoryNumber: logisticsInventoryCounts.number,
        }).from(logisticsStockMovements)
          .innerJoin(logisticsItems, eq(logisticsItems.id, logisticsStockMovements.itemId))
          .innerJoin(logisticsWarehouses, eq(logisticsWarehouses.id, logisticsStockMovements.warehouseId))
          .leftJoin(user, eq(user.id, logisticsStockMovements.createdBy))
          .leftJoin(logisticsInventoryCounts, eq(logisticsInventoryCounts.id, logisticsStockMovements.inventoryCountId))
          .where(where).orderBy(desc(logisticsStockMovements.createdAt), desc(logisticsStockMovements.id))
          .limit(pageSize).offset((page - 1) * pageSize));
      return {
        rows: rows.map((row): LedgerRow => ({ ...row.movement, sku: row.sku, itemName: row.itemName, warehouseCode: row.warehouseCode, userName: row.userName, inventoryNumber: row.inventoryNumber })),
        total, page, pageSize, pages,
      } satisfies LedgerPage;
    }),

  /** Auteurs de mouvements du tenant (options du filtre « utilisateur »). */
  ledgerUsers: (organizationId: string | null) =>
    dbTry("logistics.ledger.users", () =>
      getDrizzle().selectDistinct({ id: user.id, name: user.name }).from(logisticsStockMovements)
        .innerJoin(user, eq(user.id, logisticsStockMovements.createdBy))
        .where(tenant(logisticsStockMovements.organizationId, organizationId)).orderBy(asc(user.name)).limit(500)),

  /** Inventaires du tenant (plus récents d'abord) avec avancement du comptage. */
  counts: (organizationId: string | null, options: { readonly status?: InventoryCountStatus | null; readonly warehouseId?: string | null } = {}) =>
    dbTry("logistics.inventory.list", () =>
      getDrizzle().select({
        count: logisticsInventoryCounts, warehouseCode: logisticsWarehouses.code,
        lines: sql<number>`(select count(*)::int from ${logisticsInventoryCountLines} l where l.count_id = ${logisticsInventoryCounts.id})`,
        counted: sql<number>`(select count(l.counted)::int from ${logisticsInventoryCountLines} l where l.count_id = ${logisticsInventoryCounts.id})`,
        discrepancies: sql<number>`(select count(*)::int from ${logisticsInventoryCountLines} l where l.count_id = ${logisticsInventoryCounts.id} and l.variance <> 0)`,
      }).from(logisticsInventoryCounts)
        .innerJoin(logisticsWarehouses, eq(logisticsWarehouses.id, logisticsInventoryCounts.warehouseId))
        .where(and(
          tenant(logisticsInventoryCounts.organizationId, organizationId),
          options.status ? eq(logisticsInventoryCounts.status, options.status) : undefined,
          options.warehouseId ? eq(logisticsInventoryCounts.warehouseId, options.warehouseId) : undefined,
        )).orderBy(desc(logisticsInventoryCounts.createdAt), desc(logisticsInventoryCounts.id)).limit(200),
    ).pipe(Effect.map((rows) => rows.map((row): InventoryCountListRow => ({
      ...row.count, warehouseCode: row.warehouseCode, lines: Number(row.lines), counted: Number(row.counted), discrepancies: Number(row.discrepancies),
    })))),

  /** Inventaire et ses lignes (ordre SKU) ; null si absent ou hors tenant. */
  count: (id: string, organizationId: string | null) =>
    Effect.gen(function* () {
      if (!isUuid(id)) return null;
      const db = getDrizzle();
      const creator = aliasedTable(user, "creator");
      const validator = aliasedTable(user, "validator");
      const [head] = yield* dbTry("logistics.inventory.detail", () =>
        db.select({ count: logisticsInventoryCounts, warehouseCode: logisticsWarehouses.code, warehouseName: logisticsWarehouses.name, createdByName: creator.name, validatedByName: validator.name })
          .from(logisticsInventoryCounts)
          .innerJoin(logisticsWarehouses, eq(logisticsWarehouses.id, logisticsInventoryCounts.warehouseId))
          .leftJoin(creator, eq(creator.id, logisticsInventoryCounts.createdBy))
          .leftJoin(validator, eq(validator.id, logisticsInventoryCounts.validatedBy))
          .where(and(eq(logisticsInventoryCounts.id, id), tenant(logisticsInventoryCounts.organizationId, organizationId))).limit(1));
      if (!head) return null;
      const lines = yield* dbTry("logistics.inventory.detail.lines", () =>
        db.select({ line: logisticsInventoryCountLines, itemName: logisticsItems.name }).from(logisticsInventoryCountLines)
          .innerJoin(logisticsItems, eq(logisticsItems.id, logisticsInventoryCountLines.itemId))
          .where(eq(logisticsInventoryCountLines.countId, id)).orderBy(asc(logisticsInventoryCountLines.sku)));
      return {
        ...head.count, warehouseCode: head.warehouseCode, warehouseName: head.warehouseName, createdByName: head.createdByName, validatedByName: head.validatedByName,
        lines: lines.map((row) => ({ ...row.line, itemName: row.itemName })),
      } satisfies InventoryCountDetail;
    }),
};

export const loadLedger = (organizationId: string | null, filters: LedgerFilters) => runOrThrow(inventoryLoader.ledger(organizationId, filters));
export const loadLedgerUsers = (organizationId: string | null) => runOrThrow(inventoryLoader.ledgerUsers(organizationId));
export const loadInventoryCounts = (organizationId: string | null, options?: { readonly status?: InventoryCountStatus | null; readonly warehouseId?: string | null }) =>
  runOrThrow(inventoryLoader.counts(organizationId, options));
export const loadInventoryCount = (id: string, organizationId: string | null) => runOrThrow(inventoryLoader.count(id, organizationId));
