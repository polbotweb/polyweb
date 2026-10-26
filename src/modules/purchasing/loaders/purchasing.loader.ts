/**
 * Lecture du domaine purchasing (back-office uniquement). SEUL endroit autorisé à LIRE la base
 * pour ce domaine (les écritures passent par `services/`). Chaque lecture est un Effect
 * (`dbTry` → DbError typé), bornée au tenant ; adaptateurs Promise pour les pages Astro.
 */
import { Effect } from "effect";
import { and, asc, desc, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { logisticsItems, logisticsWarehouses } from "@/modules/logistics/schema";
import { purchasing, purchasingOrderLines, purchasingReceiptLines, purchasingReceipts, purchasingSuppliers } from "../schema";

type Order = typeof purchasing.$inferSelect;
type Supplier = typeof purchasingSuppliers.$inferSelect;
type Warehouse = typeof logisticsWarehouses.$inferSelect;
type Line = typeof purchasingOrderLines.$inferSelect;
type Receipt = typeof purchasingReceipts.$inferSelect;
type ReceiptLine = typeof purchasingReceiptLines.$inferSelect;

export type ReceiptDetail = Receipt & { readonly lines: readonly ReceiptLine[] };
export type PurchaseOrderDetail = Order & {
  readonly supplier: Supplier | null;
  readonly warehouse: Warehouse | null;
  readonly lines: readonly Line[];
  readonly receipts: readonly ReceiptDetail[];
};

const tenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));
const first = <T>(rows: readonly T[]): T | null => rows[0] ?? null;

export const purchasingLoader = {
  order: (id: string, organizationId: string | null) =>
    Effect.gen(function* () {
      const db = getDrizzle();
      const row = first(yield* dbTry("purchasing.order", () => db.select().from(purchasing).where(and(eq(purchasing.id, id), tenant(purchasing.organizationId, organizationId))).limit(1)));
      if (!row) return null;
      const [supplier, warehouse, lines, receipts] = yield* dbTry("purchasing.order.related", () => Promise.all([
        db.select().from(purchasingSuppliers).where(eq(purchasingSuppliers.id, row.supplierId)).limit(1),
        db.select().from(logisticsWarehouses).where(eq(logisticsWarehouses.id, row.warehouseId)).limit(1),
        db.select().from(purchasingOrderLines).where(eq(purchasingOrderLines.orderId, id)).orderBy(asc(purchasingOrderLines.position)),
        db.select().from(purchasingReceipts).where(eq(purchasingReceipts.orderId, id)).orderBy(asc(purchasingReceipts.receivedAt)),
      ]));
      const receiptLines = receipts.length === 0 ? [] : yield* dbTry("purchasing.order.receiptLines", () =>
        db.select({ line: purchasingReceiptLines }).from(purchasingReceiptLines).innerJoin(purchasingReceipts, eq(purchasingReceipts.id, purchasingReceiptLines.receiptId)).where(eq(purchasingReceipts.orderId, id)));
      return {
        ...row, supplier: first(supplier), warehouse: first(warehouse), lines,
        receipts: receipts.map((receipt) => ({ ...receipt, lines: receiptLines.map((r) => r.line).filter((l) => l.receiptId === receipt.id) })),
      } satisfies PurchaseOrderDetail;
    }),

  supplier: (id: string, organizationId: string | null) =>
    dbTry("purchasing.supplier", () => getDrizzle().select().from(purchasingSuppliers).where(and(eq(purchasingSuppliers.id, id), tenant(purchasingSuppliers.organizationId, organizationId))).limit(1)).pipe(Effect.map(first)),

  suppliers: (organizationId: string | null, options: { readonly activeOnly?: boolean } = {}) =>
    dbTry("purchasing.suppliers", () => getDrizzle().select().from(purchasingSuppliers)
      .where(and(tenant(purchasingSuppliers.organizationId, organizationId), options.activeOnly ? eq(purchasingSuppliers.active, true) : undefined)).orderBy(asc(purchasingSuppliers.code))),

  /** Entrepôts actifs et articles du tenant (formulaire de commande). */
  formOptions: (organizationId: string | null) =>
    dbTry("purchasing.formOptions", () => Promise.all([
      getDrizzle().select().from(logisticsWarehouses).where(and(tenant(logisticsWarehouses.organizationId, organizationId), eq(logisticsWarehouses.active, true))).orderBy(asc(logisticsWarehouses.code)),
      getDrizzle().select({ id: logisticsItems.id, sku: logisticsItems.sku, name: logisticsItems.name }).from(logisticsItems).where(tenant(logisticsItems.organizationId, organizationId)).orderBy(asc(logisticsItems.sku)),
    ])).pipe(Effect.map(([warehouses, items]) => ({ warehouses, items }))),

  /** Dernières réceptions du tenant. */
  receipts: (organizationId: string | null, limit = 100) =>
    dbTry("purchasing.receipts", () => getDrizzle().select({ receipt: purchasingReceipts, orderNumber: purchasing.number, orderTitle: purchasing.title })
      .from(purchasingReceipts).innerJoin(purchasing, eq(purchasing.id, purchasingReceipts.orderId))
      .where(tenant(purchasingReceipts.organizationId, organizationId)).orderBy(desc(purchasingReceipts.receivedAt)).limit(limit))
      .pipe(Effect.map((rows) => rows.map((row) => ({ ...row.receipt, orderNumber: row.orderNumber, orderTitle: row.orderTitle })))),
};

export const loadPurchaseOrder = (id: string, organizationId: string | null) => runOrThrow(purchasingLoader.order(id, organizationId));
export const loadSupplier = (id: string, organizationId: string | null) => runOrThrow(purchasingLoader.supplier(id, organizationId));
export const loadSuppliers = (organizationId: string | null, options?: { readonly activeOnly?: boolean }) => runOrThrow(purchasingLoader.suppliers(organizationId, options));
export const loadPurchasingFormOptions = (organizationId: string | null) => runOrThrow(purchasingLoader.formOptions(organizationId));
export const loadReceipts = (organizationId: string | null, limit?: number) => runOrThrow(purchasingLoader.receipts(organizationId, limit));
