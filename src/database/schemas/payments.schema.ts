import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { organization } from "./auth.schema";

/**
 * Module de paiement générique (optionnel, PAYMENTS_ENABLED=true).
 *
 * Repris du module payments d'atlaselle, découplé du métier voyage : un
 * paiement ne connaît qu'une `reference` libre (ex. `order:42`,
 * `form-submission:<id>`) que le module appelant interprète.
 */
export const PAYMENT_STATUSES = ["created", "pending", "paid", "failed", "cancelled", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    reference: varchar("reference", { length: 200 }).notNull(),
    description: text("description"),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerSessionId: varchar("provider_session_id", { length: 160 }),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }),
    status: text("status", { enum: PAYMENT_STATUSES }).default("created").notNull(),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    customerEmail: text("customer_email"),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
    paidAt: timestamp("paid_at"),
    failedAt: timestamp("failed_at"),
  },
  (table) => [
    uniqueIndex("payments_idempotency_uidx").on(table.idempotencyKey),
    index("payments_reference_idx").on(table.reference),
    index("payments_status_idx").on(table.status),
    index("payments_provider_payment_idx").on(table.providerPaymentId),
    index("payments_provider_session_idx").on(table.providerSessionId),
    check("payments_amount_ck", sql`${table.amount} >= 0`),
  ],
);

export type Payment = typeof payments.$inferSelect;
