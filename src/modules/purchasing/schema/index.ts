/**
 * Tables du domaine purchasing : fournisseurs, commandes fournisseur et leurs lignes (montants en
 * unités mineures, core/money), réceptions de marchandises et leurs lignes (chaque ligne reçue
 * pointe le mouvement de stock `receipt` créé dans le module logistique), révisions et verrous
 * d'édition des commandes. Multi-tenant (`organizationId`, null = plateforme).
 *
 * Exportées depuis `src/database/schemas.ts` ; migration produite par `pnpm db:generate`.
 */
import { bigint, boolean, check, date, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user } from "@database/schemas/auth.schema";
import { logisticsItems, logisticsStockMovements, logisticsWarehouses } from "@/modules/logistics/schema";
import { PURCHASE_ORDER_STATUSES } from "../domain/workflow";

export const purchasingSuppliers = pgTable("purchasing_suppliers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  country: text("country"),
  vatNumber: text("vat_number"),
  address: text("address"),
  paymentTermDays: integer("payment_term_days").default(30).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [uniqueIndex("purchasing_suppliers_org_code_uidx").on(table.organizationId, table.code)]);

/** Commandes fournisseur : entité principale du module (`purchasing`, alias attendu par le socle). */
export const purchasing = pgTable("purchasing_orders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  /** Numéro de bon de commande, attribué à l'envoi (core/numbering). */
  number: text("number"),
  status: text("status", { enum: PURCHASE_ORDER_STATUSES }).default("DRAFT").notNull(),
  supplierId: text("supplier_id").notNull().references(() => purchasingSuppliers.id, { onDelete: "no action" }),
  /** Entrepôt de livraison (module logistique). */
  warehouseId: text("warehouse_id").notNull().references(() => logisticsWarehouses.id, { onDelete: "no action" }),
  currency: text("currency").default("EUR").notNull(),
  expectedDate: date("expected_date", { mode: "string" }),
  netMinor: bigint("net_minor", { mode: "number" }).default(0).notNull(),
  sentAt: timestamp("sent_at"),
  notes: text("notes"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("purchasing_orders_org_slug_uidx").on(table.organizationId, table.slug),
  uniqueIndex("purchasing_orders_org_number_uidx").on(table.organizationId, table.number),
  index("purchasing_orders_org_status_idx").on(table.organizationId, table.status),
  index("purchasing_orders_supplier_idx").on(table.supplierId),
]);
export const purchasingOrders = purchasing;

export const purchasingOrderLines = pgTable("purchasing_order_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id").notNull().references(() => purchasing.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  itemId: text("item_id").notNull().references(() => logisticsItems.id, { onDelete: "no action" }),
  sku: text("sku").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull(),
  receivedQuantity: integer("received_quantity").default(0).notNull(),
  unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
  netMinor: bigint("net_minor", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("purchasing_order_lines_position_uidx").on(table.orderId, table.position),
  check("purchasing_order_lines_quantity_positive", sql`${table.quantity} > 0`),
  check("purchasing_order_lines_received_range", sql`${table.receivedQuantity} >= 0 AND ${table.receivedQuantity} <= ${table.quantity}`),
  check("purchasing_order_lines_price_non_negative", sql`${table.unitPriceMinor} >= 0`),
]);

/** Bons de réception : jamais modifiés ; chaque réception produit des mouvements de stock. */
export const purchasingReceipts = pgTable("purchasing_receipts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull().references(() => purchasing.id, { onDelete: "no action" }),
  number: text("number").notNull(),
  warehouseId: text("warehouse_id").notNull().references(() => logisticsWarehouses.id, { onDelete: "no action" }),
  /** Référence du bon de livraison fournisseur. */
  supplierReference: text("supplier_reference"),
  notes: text("notes"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
}, (table) => [
  uniqueIndex("purchasing_receipts_org_number_uidx").on(table.organizationId, table.number),
  index("purchasing_receipts_order_idx").on(table.orderId),
]);

export const purchasingReceiptLines = pgTable("purchasing_receipt_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  receiptId: text("receipt_id").notNull().references(() => purchasingReceipts.id, { onDelete: "cascade" }),
  orderLineId: text("order_line_id").notNull().references(() => purchasingOrderLines.id, { onDelete: "no action" }),
  itemId: text("item_id").notNull().references(() => logisticsItems.id, { onDelete: "no action" }),
  sku: text("sku").notNull(),
  quantity: integer("quantity").notNull(),
  movementId: text("movement_id").notNull().references(() => logisticsStockMovements.id, { onDelete: "no action" }),
}, (table) => [
  index("purchasing_receipt_lines_receipt_idx").on(table.receiptId),
  check("purchasing_receipt_lines_quantity_positive", sql`${table.quantity} > 0`),
]);

/** Révisions (core/revision) : une ligne par écriture de commande. */
export const purchasingOrderRevisions = pgTable("purchasing_order_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => purchasing.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: PURCHASE_ORDER_STATUSES }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("purchasing_order_revisions_resource_idx").on(table.resourceId)]);

/** Verrous d'édition (core/locks) : une ligne par commande. */
export const purchasingOrderLocks = pgTable("purchasing_order_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => purchasing.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});
