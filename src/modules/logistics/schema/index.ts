/**
 * Tables du domaine logistics : entrepôts, articles stockés, mouvements de stock (niveau = somme
 * signée des `delta`), expéditions et leurs lignes, révisions et verrous d'édition des expéditions.
 * Multi-tenant (`organizationId`, null = plateforme).
 *
 * Exportées depuis `src/database/schemas.ts` ; migration produite par `pnpm db:generate`.
 */
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user } from "@database/schemas/auth.schema";
import { sales } from "@/modules/sales/schema";
import { productVariants } from "@/modules/shop/schema";
import { SHIPMENT_STATUSES } from "../domain/workflow";
import { MOVEMENT_KINDS, MOVEMENT_SOURCES, RESERVATION_STATUSES } from "../domain/stock";
import { INVENTORY_COUNT_STATUSES } from "../domain/inventory";

export const logisticsWarehouses = pgTable("logistics_warehouses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  country: text("country"),
  address: text("address"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [uniqueIndex("logistics_warehouses_org_code_uidx").on(table.organizationId, table.code)]);

/** Article stocké, identifié par SKU dans le tenant ; lien optionnel vers une variante boutique. */
export const logisticsItems = pgTable("logistics_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  variantId: text("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [uniqueIndex("logistics_items_org_sku_uidx").on(table.organizationId, table.sku)]);

/** Expéditions : entité principale du module (`logistics`, alias attendu par le socle). */
export const logistics = pgTable("logistics_shipments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  /** Numéro de bon de livraison, attribué à READY (core/numbering). */
  number: text("number"),
  status: text("status", { enum: SHIPMENT_STATUSES }).default("DRAFT").notNull(),
  warehouseId: text("warehouse_id").notNull().references(() => logisticsWarehouses.id, { onDelete: "no action" }),
  /** Facture / devis du module ventes à l'origine de l'expédition. */
  salesDocumentId: text("sales_document_id").references(() => sales.id, { onDelete: "set null" }),
  recipientName: text("recipient_name").notNull(),
  address: text("address"),
  country: text("country").notNull(),
  carrier: text("carrier"),
  trackingNumber: text("tracking_number"),
  weightGrams: integer("weight_grams"),
  shippedAt: timestamp("shipped_at"),
  deliveredAt: timestamp("delivered_at"),
  notes: text("notes"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("logistics_shipments_org_slug_uidx").on(table.organizationId, table.slug),
  uniqueIndex("logistics_shipments_org_number_uidx").on(table.organizationId, table.number),
  index("logistics_shipments_org_status_idx").on(table.organizationId, table.status),
  index("logistics_shipments_sales_idx").on(table.salesDocumentId),
  check("logistics_shipments_weight_non_negative", sql`${table.weightGrams} IS NULL OR ${table.weightGrams} >= 0`),
]);
export const logisticsShipments = logistics;

export const logisticsShipmentLines = pgTable("logistics_shipment_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  shipmentId: text("shipment_id").notNull().references(() => logistics.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  itemId: text("item_id").notNull().references(() => logisticsItems.id, { onDelete: "no action" }),
  sku: text("sku").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull(),
}, (table) => [
  uniqueIndex("logistics_shipment_lines_position_uidx").on(table.shipmentId, table.position),
  check("logistics_shipment_lines_quantity_positive", sql`${table.quantity} > 0`),
]);

/** Journal des mouvements : jamais modifié, le niveau de stock en est la somme. */
export const logisticsStockMovements = pgTable("logistics_stock_movements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  warehouseId: text("warehouse_id").notNull().references(() => logisticsWarehouses.id, { onDelete: "no action" }),
  itemId: text("item_id").notNull().references(() => logisticsItems.id, { onDelete: "no action" }),
  kind: text("kind", { enum: MOVEMENT_KINDS }).notNull(),
  delta: integer("delta").notNull(),
  shipmentId: text("shipment_id").references(() => logistics.id, { onDelete: "set null" }),
  /** Origine du mouvement (grand livre) ; `inventoryCountId` renseigné quand `source = inventory`. */
  source: text("source", { enum: MOVEMENT_SOURCES }).default("manual").notNull(),
  inventoryCountId: text("inventory_count_id").references(() => logisticsInventoryCounts.id, { onDelete: "set null" }),
  reference: text("reference"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("logistics_stock_movements_ledger_idx").on(table.organizationId, table.createdAt),
  index("logistics_stock_movements_inventory_idx").on(table.inventoryCountId),
  index("logistics_stock_movements_level_idx").on(table.warehouseId, table.itemId),
  index("logistics_stock_movements_shipment_idx").on(table.shipmentId),
  check("logistics_stock_movements_delta_non_zero", sql`${table.delta} <> 0`),
]);

/**
 * Réservations de stock (tunnel de vente) : quantité bloquée sur un article d'un entrepôt jusqu'au
 * paiement (`consumed` → mouvement `issue`), à l'échéance ou à l'annulation (`released`).
 * Disponible = niveau (somme des mouvements) − réservations `active` non échues.
 */
export const logisticsStockReservations = pgTable("logistics_stock_reservations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  warehouseId: text("warehouse_id").notNull().references(() => logisticsWarehouses.id, { onDelete: "no action" }),
  itemId: text("item_id").notNull().references(() => logisticsItems.id, { onDelete: "no action" }),
  quantity: integer("quantity").notNull(),
  /** Origine de la réservation, ex. `order:<id>` (idempotence et libération groupée). */
  reference: text("reference").notNull(),
  status: text("status", { enum: RESERVATION_STATUSES }).default("active").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("logistics_stock_reservations_active_idx").on(table.warehouseId, table.itemId).where(sql`${table.status} = 'active'`),
  index("logistics_stock_reservations_reference_idx").on(table.reference),
  index("logistics_stock_reservations_expiry_idx").on(table.expiresAt).where(sql`${table.status} = 'active'`),
  check("logistics_stock_reservations_quantity_positive", sql`${table.quantity} > 0`),
]);

/** Révisions (core/revision) : une ligne par écriture d'expédition. */
export const logisticsShipmentRevisions = pgTable("logistics_shipment_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => logistics.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: SHIPMENT_STATUSES }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("logistics_shipment_revisions_resource_idx").on(table.resourceId)]);

/** Verrous d'édition (core/locks) : une ligne par expédition. */
export const logisticsShipmentLocks = pgTable("logistics_shipment_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => logistics.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

/**
 * Inventaires physiques par entrepôt (OPEN → VALIDATED | CANCELLED). Un seul inventaire ouvert
 * par entrepôt (index unique partiel). La validation poste les ajustements d'écart.
 */
export const logisticsInventoryCounts = pgTable("logistics_inventory_counts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  warehouseId: text("warehouse_id").notNull().references(() => logisticsWarehouses.id, { onDelete: "no action" }),
  number: text("number").notNull(),
  status: text("status", { enum: INVENTORY_COUNT_STATUSES }).default("OPEN").notNull(),
  note: text("note"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  validatedBy: text("validated_by").references(() => user.id, { onDelete: "set null" }),
  validatedAt: timestamp("validated_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("logistics_inventory_counts_org_number_uidx").on(table.organizationId, table.number),
  uniqueIndex("logistics_inventory_counts_open_uidx").on(table.warehouseId).where(sql`${table.status} = 'OPEN'`),
  index("logistics_inventory_counts_org_idx").on(table.organizationId, table.createdAt),
]);

/**
 * Lignes d'inventaire : stock théorique figé à l'ouverture (`expected`), quantité comptée
 * (null = non comptée), niveau réel et écart figés à la validation.
 */
export const logisticsInventoryCountLines = pgTable("logistics_inventory_count_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  countId: text("count_id").notNull().references(() => logisticsInventoryCounts.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull().references(() => logisticsItems.id, { onDelete: "no action" }),
  sku: text("sku").notNull(),
  expected: integer("expected").notNull(),
  counted: integer("counted"),
  system: integer("system"),
  variance: integer("variance"),
  countedBy: text("counted_by").references(() => user.id, { onDelete: "set null" }),
  countedAt: timestamp("counted_at"),
}, (table) => [
  uniqueIndex("logistics_inventory_count_lines_item_uidx").on(table.countId, table.itemId),
  check("logistics_inventory_count_lines_counted_non_negative", sql`${table.counted} IS NULL OR ${table.counted} >= 0`),
]);
