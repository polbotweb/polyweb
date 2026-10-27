/**
 * Retours clients (RMA) : une demande par retour (`order_returns`), ses lignes
 * (`order_return_lines`, quantités demandées / acceptées / remises en stock). Le remboursement
 * passe par core/refunds (`refund_id`) ; la remise en stock par Logistics (mouvements `return`).
 * Exporté depuis `src/database/schemas.ts` ; migration produite par `pnpm db:generate`.
 */
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { organization, user } from "@database/schemas/auth.schema";
import { refunds } from "@database/schemas/refunds.schema";
import { orderLines, orders } from "./orders";
import { RETURN_CONDITIONS, RETURN_REASONS, RETURN_STATUSES } from "../domain/returns";

export const orderReturns = pgTable("order_returns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  status: text("status", { enum: RETURN_STATUSES }).default("REQUESTED").notNull(),
  reason: text("reason", { enum: RETURN_REASONS }).notNull(),
  customerNote: varchar("customer_note", { length: 1000 }),
  adminNote: varchar("admin_note", { length: 1000 }),
  currency: varchar("currency", { length: 3 }).notNull(),
  /** Montant remboursé fixé à l'inspection (unités mineures), puis remboursement core/refunds. */
  refundMinor: integer("refund_minor"),
  refundId: text("refund_id").references(() => refunds.id, { onDelete: "set null" }),
  /** Tentatives de remboursement (clé d'idempotence `rma:<id>:<n>`, nouvelle clé après un échec). */
  refundAttempts: integer("refund_attempts").default(0).notNull(),
  approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  receivedBy: text("received_by").references(() => user.id, { onDelete: "set null" }),
  receivedAt: timestamp("received_at"),
  inspectedBy: text("inspected_by").references(() => user.id, { onDelete: "set null" }),
  inspectedAt: timestamp("inspected_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("order_returns_org_number_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.number),
  index("order_returns_order_idx").on(table.orderId),
  index("order_returns_org_status_created_idx").on(table.organizationId, table.status, table.createdAt),
  check("order_returns_refund_non_negative", sql`${table.refundMinor} is null or ${table.refundMinor} >= 0`),
]);

export const orderReturnLines = pgTable("order_return_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  returnId: text("return_id").notNull().references(() => orderReturns.id, { onDelete: "cascade" }),
  orderLineId: text("order_line_id").notNull().references(() => orderLines.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  acceptedQuantity: integer("accepted_quantity"),
  restockedQuantity: integer("restocked_quantity"),
  condition: text("condition", { enum: RETURN_CONDITIONS }),
}, (table) => [
  uniqueIndex("order_return_lines_return_line_uidx").on(table.returnId, table.orderLineId),
  index("order_return_lines_order_line_idx").on(table.orderLineId),
  check("order_return_lines_quantities", sql`${table.quantity} > 0
    and (${table.acceptedQuantity} is null or (${table.acceptedQuantity} >= 0 and ${table.acceptedQuantity} <= ${table.quantity}))
    and (${table.restockedQuantity} is null or (${table.restockedQuantity} >= 0 and ${table.restockedQuantity} <= coalesce(${table.acceptedQuantity}, 0)))`),
]);

export type OrderReturnRow = typeof orderReturns.$inferSelect;
export type OrderReturnLineRow = typeof orderReturnLines.$inferSelect;
