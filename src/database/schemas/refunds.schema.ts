import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, bigint, jsonb, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.schema";
import { payments } from "./payments.schema";

/**
 * Brique core/refunds (docs/refunds.md) : remboursements totaux ou partiels d'un paiement
 * core/payments, quel que soit le module propriétaire (`purpose` de la référence).
 *
 * - Montant en unités mineures (core/money), même devise que le paiement ; la somme des
 *   remboursements `pending` + `succeeded` d'un paiement ne dépasse jamais son montant
 *   (contrôle sous verrou `FOR UPDATE` du paiement).
 * - `idempotencyKey` unique : une même demande (ex. `rma:<id>`) ne rembourse qu'une fois ;
 *   la clé fournisseur est `refund:<id>`.
 * - `requestedBy` null = remboursement initié chez le fournisseur (tableau de bord Stripe).
 */
export const REFUND_STATUSES = ["pending", "succeeded", "failed", "cancelled"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_REASONS = ["requested_by_customer", "duplicate", "fraudulent", "return", "cancellation", "other"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const refunds = pgTable(
  "refunds",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
    /** Référence du paiement (`<purpose>:<subjectId>`), copiée pour le filtrage et l'audit. */
    reference: varchar("reference", { length: 200 }).notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerRefundId: varchar("provider_refund_id", { length: 160 }),
    status: text("status", { enum: REFUND_STATUSES }).default("pending").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    reason: text("reason", { enum: REFUND_REASONS }).default("requested_by_customer").notNull(),
    note: varchar("note", { length: 500 }),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    /** Consignes au module propriétaire (ex. `{ restock: false }`) ; jamais de secret. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    failureReason: varchar("failure_reason", { length: 200 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
    succeededAt: timestamp("succeeded_at"),
    failedAt: timestamp("failed_at"),
  },
  (table) => [
    uniqueIndex("refunds_idempotency_uidx").on(table.idempotencyKey),
    uniqueIndex("refunds_provider_refund_uidx").on(table.provider, table.providerRefundId),
    index("refunds_payment_idx").on(table.paymentId),
    index("refunds_reference_idx").on(table.reference),
    index("refunds_org_status_idx").on(table.organizationId, table.status, table.createdAt),
    check("refunds_amount_ck", sql`${table.amount} > 0`),
  ],
);

export type Refund = typeof refunds.$inferSelect;
