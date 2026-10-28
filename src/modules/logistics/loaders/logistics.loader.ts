/**
 * Lecture du domaine logistics (back-office uniquement). SEUL endroit autorisé à LIRE la base
 * pour ce domaine (les écritures passent par `services/`). Chaque lecture est un Effect
 * (`dbTry` → DbError typé), bornée au tenant ; adaptateurs Promise pour les pages Astro.
 */
import { Effect } from "effect";
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { sales } from "@/modules/sales/schema";
import { logistics, logisticsItems, logisticsShipmentLines, logisticsStockMovements, logisticsWarehouses } from "../schema";

type Shipment = typeof logistics.$inferSelect;
type Warehouse = typeof logisticsWarehouses.$inferSelect;
type Line = typeof logisticsShipmentLines.$inferSelect;
type Movement = typeof logisticsStockMovements.$inferSelect;

export type ShipmentDetail = Shipment & {
  readonly warehouse: Warehouse | null;
  readonly lines: readonly Line[];
  readonly salesDocument: { id: string; kind: string; number: string | null; title: string } | null;
};
export type StockLevelRow = { warehouseId: string; itemId: string; sku: string; name: string; warehouseCode: string; level: number };
export type MovementListRow = Movement & { readonly sku: string; readonly warehouseCode: string };

const tenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));
const first = <T>(rows: readonly T[]): T | null => rows[0] ?? null;

export const logisticsLoader = {
  shipment: (id: string, organizationId: string | null) =>
    Effect.gen(function* () {
      const db = getDrizzle();
      const row = first(yield* dbTry("logistics.shipment", () => db.select().from(logistics).where(and(eq(logistics.id, id), tenant(logistics.organizationId, organizationId))).limit(1)));
      if (!row) return null;
      const [warehouse, lines, salesDocument] = yield* dbTry("logistics.shipment.related", () => Promise.all([
        db.select().from(logisticsWarehouses).where(eq(logisticsWarehouses.id, row.warehouseId)).limit(1),
        db.select().from(logisticsShipmentLines).where(eq(logisticsShipmentLines.shipmentId, id)).orderBy(asc(logisticsShipmentLines.position)),
        row.salesDocumentId ? db.select({ id: sales.id, kind: sales.kind, number: sales.number, title: sales.title }).from(sales).where(eq(sales.id, row.salesDocumentId)).limit(1) : Promise.resolve([]),
      ]));
      return { ...row, warehouse: first(warehouse), lines, salesDocument: first(salesDocument) } satisfies ShipmentDetail;
    }),

  warehouse: (id: string, organizationId: string | null) =>
    dbTry("logistics.warehouse", () => getDrizzle().select().from(logisticsWarehouses).where(and(eq(logisticsWarehouses.id, id), tenant(logisticsWarehouses.organizationId, organizationId))).limit(1)).pipe(Effect.map(first)),

  warehouses: (organizationId: string | null) =>
    dbTry("logistics.warehouses", () => getDrizzle().select().from(logisticsWarehouses).where(tenant(logisticsWarehouses.organizationId, organizationId)).orderBy(asc(logisticsWarehouses.code))),

  item: (id: string, organizationId: string | null) =>
    dbTry("logistics.item", () => getDrizzle().select().from(logisticsItems).where(and(eq(logisticsItems.id, id), tenant(logisticsItems.organizationId, organizationId))).limit(1)).pipe(Effect.map(first)),

  items: (organizationId: string | null) =>
    dbTry("logistics.items", () => getDrizzle().select().from(logisticsItems).where(tenant(logisticsItems.organizationId, organizationId)).orderBy(asc(logisticsItems.sku))),

  /** Niveaux par entrepôt × article (articles ayant au moins un mouvement). */
  stockLevels: (organizationId: string | null, warehouseId?: string) =>
    dbTry("logistics.stock.levels", () =>
      getDrizzle().select({
        warehouseId: logisticsStockMovements.warehouseId, itemId: logisticsStockMovements.itemId, sku: logisticsItems.sku, name: logisticsItems.name,
        warehouseCode: logisticsWarehouses.code, level: sql<number>`sum(${logisticsStockMovements.delta})::int`,
      }).from(logisticsStockMovements)
        .innerJoin(logisticsItems, eq(logisticsItems.id, logisticsStockMovements.itemId))
        .innerJoin(logisticsWarehouses, eq(logisticsWarehouses.id, logisticsStockMovements.warehouseId))
        .where(and(tenant(logisticsStockMovements.organizationId, organizationId), warehouseId ? eq(logisticsStockMovements.warehouseId, warehouseId) : undefined))
        .groupBy(logisticsStockMovements.warehouseId, logisticsStockMovements.itemId, logisticsItems.sku, logisticsItems.name, logisticsWarehouses.code)
        .orderBy(asc(logisticsWarehouses.code), asc(logisticsItems.sku)),
    ).pipe(Effect.map((rows): StockLevelRow[] => rows.map((row) => ({ ...row, level: Number(row.level) })))),

  /** Derniers mouvements du tenant (journal). */
  movements: (organizationId: string | null, limit = 100) =>
    dbTry("logistics.movements", () =>
      getDrizzle().select({ movement: logisticsStockMovements, sku: logisticsItems.sku, warehouseCode: logisticsWarehouses.code }).from(logisticsStockMovements)
        .innerJoin(logisticsItems, eq(logisticsItems.id, logisticsStockMovements.itemId))
        .innerJoin(logisticsWarehouses, eq(logisticsWarehouses.id, logisticsStockMovements.warehouseId))
        .where(tenant(logisticsStockMovements.organizationId, organizationId)).orderBy(desc(logisticsStockMovements.createdAt), desc(logisticsStockMovements.id)).limit(limit),
    ).pipe(Effect.map((rows): MovementListRow[] => rows.map((row) => ({ ...row.movement, sku: row.sku, warehouseCode: row.warehouseCode })))),

  /** Documents de vente du tenant rattachables à une expédition (factures et devis). */
  salesDocuments: (organizationId: string | null) =>
    dbTry("logistics.salesDocuments", () => getDrizzle().select({ id: sales.id, kind: sales.kind, title: sales.title, number: sales.number }).from(sales)
      .where(tenant(sales.organizationId, organizationId)).orderBy(desc(sales.createdAt), desc(sales.id)).limit(200)),
};

export const loadShipment = (id: string, organizationId: string | null) => runOrThrow(logisticsLoader.shipment(id, organizationId));
export const loadWarehouse = (id: string, organizationId: string | null) => runOrThrow(logisticsLoader.warehouse(id, organizationId));
export const loadWarehouses = (organizationId: string | null) => runOrThrow(logisticsLoader.warehouses(organizationId));
export const loadItem = (id: string, organizationId: string | null) => runOrThrow(logisticsLoader.item(id, organizationId));
export const loadItems = (organizationId: string | null) => runOrThrow(logisticsLoader.items(organizationId));
export const loadStockLevels = (organizationId: string | null, warehouseId?: string) => runOrThrow(logisticsLoader.stockLevels(organizationId, warehouseId));
export const loadMovements = (organizationId: string | null, limit?: number) => runOrThrow(logisticsLoader.movements(organizationId, limit));
export const loadSalesDocumentOptions = (organizationId: string | null) => runOrThrow(logisticsLoader.salesDocuments(organizationId));
