/**
 * Tables du tunnel de vente : paniers (invités par cookie signé ou utilisateurs connectés),
 * commandes et lignes de commande. Montants en unités mineures (core/money) ; les lignes
 * figent SKU, libellé et prix au moment de la commande (audit indépendant du catalogue).
 *
 * Fichier séparé de `./index.ts` : il dépend des schémas Sales et Logistics (liens optionnels
 * facture / expédition), eux-mêmes dépendants du catalogue — pas de cycle d'import.
 * Exporté depuis `src/database/schemas.ts` ; migration produite par `pnpm db:generate`.
 */
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { organization, user } from "@database/schemas/auth.schema";
import { payments } from "@database/schemas/payments.schema";
import { LOCALES } from "@i18n/config";
import { sales } from "@/modules/sales/schema";
import { logistics } from "@/modules/logistics/schema";
import { productVariants } from "./index";
import { ORDER_STATUSES } from "../domain/orders";
import { SHIPPING_METHODS } from "../domain/checkout";
import { TAX_CATEGORIES, TAX_TREATMENTS } from "@/modules/tax/domain/rules";

/** Panier : un par cookie invité ou par utilisateur connecté (fusion à la connexion). */
export const carts = pgTable("carts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  currency: varchar("currency", { length: 3 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("carts_org_user_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.userId).where(sql`${table.userId} is not null`),
  index("carts_updated_idx").on(table.updatedAt),
]);

export const cartLines = pgTable("cart_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  cartId: text("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
  variantId: text("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("cart_lines_cart_variant_uidx").on(table.cartId, table.variantId),
  check("cart_lines_quantity_range", sql`${table.quantity} between 1 and 99`),
]);

/** Commande : numéro sans trou attribué à la création, paiement via core/payments (`shop-order`). */
export const orders = pgTable("orders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  status: text("status", { enum: ORDER_STATUSES }).default("PENDING_PAYMENT").notNull(),
  locale: text("locale", { enum: LOCALES }).notNull(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  email: text("email").notNull(),
  customerName: text("customer_name").notNull(),
  phone: text("phone"),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  postcode: text("postcode").notNull(),
  city: text("city").notNull(),
  country: varchar("country", { length: 2 }).notNull(),
  shippingMethod: text("shipping_method", { enum: SHIPPING_METHODS }).notNull(),
  shippingMinor: integer("shipping_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  netMinor: integer("net_minor").notNull(),
  taxMinor: integer("tax_minor").notNull(),
  grossMinor: integer("gross_minor").notNull(),
  taxTreatment: text("tax_treatment", { enum: TAX_TREATMENTS }).notNull(),
  taxCountry: varchar("tax_country", { length: 2 }),
  /** Ventilation par taux figée : `[{ ratePercent, baseMinor, taxMinor }]`. */
  taxBreakdown: jsonb("tax_breakdown").$type<readonly { ratePercent: string; baseMinor: number; taxMinor: number }[]>().notNull(),
  paymentId: text("payment_id").references(() => payments.id, { onDelete: "set null" }),
  /** Paiement reçu alors que la réservation avait expiré et que le stock manquait : à traiter. */
  stockShortage: text("stock_shortage"),
  salesDocumentId: text("sales_document_id").references(() => sales.id, { onDelete: "set null" }),
  shipmentId: text("shipment_id").references(() => logistics.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at").notNull(),
  paidAt: timestamp("paid_at"),
  shippedAt: timestamp("shipped_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("orders_org_number_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.number),
  index("orders_org_status_created_idx").on(table.organizationId, table.status, table.createdAt),
  index("orders_user_idx").on(table.userId),
  index("orders_email_idx").on(table.email),
  check("orders_amounts_consistent", sql`${table.netMinor} >= 0 and ${table.taxMinor} >= 0 and ${table.shippingMinor} >= 0 and ${table.grossMinor} = ${table.netMinor} + ${table.taxMinor}`),
]);

export const orderLines = pgTable("order_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  variantId: text("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  sku: text("sku").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull(),
  /** Prix public TTC unitaire au catalogue au moment de la commande. */
  unitPriceMinor: integer("unit_price_minor").notNull(),
  lineTotalMinor: integer("line_total_minor").notNull(),
  taxCategory: text("tax_category", { enum: TAX_CATEGORIES }).notNull(),
}, (table) => [
  uniqueIndex("order_lines_order_position_uidx").on(table.orderId, table.position),
  check("order_lines_quantity_positive", sql`${table.quantity} > 0`),
  check("order_lines_total_consistent", sql`${table.lineTotalMinor} = ${table.unitPriceMinor} * ${table.quantity}`),
]);
