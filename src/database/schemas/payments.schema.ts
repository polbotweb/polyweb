import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, bigint, boolean, jsonb, uniqueIndex, unique, index, check } from "drizzle-orm/pg-core";
import { organization } from "./auth.schema";

/**
 * Module de paiement générique (optionnel, PAYMENTS_ENABLED=true).
 *
 * Repris du module payments d'atlaselle, découplé du métier voyage : un
 * paiement ne connaît qu'une `reference` libre (ex. `order:42`,
 * `form-submission:<id>`) que le module appelant interprète.
 *
 * Brique core/payments (docs/payments.md) : `reference` = `<purpose>:<subjectId>`
 * (ex. `booking-deposit:<id>`, `sales-invoice:<id>`), montant en unités mineures
 * (core/money), échéance `expiresAt` du lien de paiement.
 */
export const PAYMENT_STATUSES = ["created", "pending", "paid", "failed", "cancelled", "refunded", "expired"] as const;
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
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    customerEmail: text("customer_email"),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
    paidAt: timestamp("paid_at"),
    failedAt: timestamp("failed_at"),
    /** Échéance du lien de paiement (au-delà : `expired`). */
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    uniqueIndex("payments_idempotency_uidx").on(table.idempotencyKey),
    index("payments_reference_idx").on(table.reference),
    index("payments_status_idx").on(table.status),
    index("payments_provider_payment_idx").on(table.providerPaymentId),
    index("payments_provider_session_idx").on(table.providerSessionId),
    check("payments_amount_ck", sql`${table.amount} >= 0`),
    index("payments_expiry_idx").on(table.status, table.expiresAt),
  ],
);

export type Payment = typeof payments.$inferSelect;

/**
 * Événements fournisseur déjà traités (idempotence des webhooks) : une ligne par
 * `(provider, event_id)`, insérée dans la même transaction que l'effet métier —
 * un rejeu (retry Stripe) est détecté et ignoré, un échec annule aussi la ligne.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    provider: varchar("provider", { length: 32 }).notNull(),
    eventId: varchar("event_id", { length: 160 }).notNull(),
    type: varchar("type", { length: 80 }).notNull(),
    paymentId: text("payment_id").references(() => payments.id, { onDelete: "set null" }),
    processedAt: timestamp("processed_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("payment_events_provider_event_uidx").on(table.provider, table.eventId),
    index("payment_events_payment_idx").on(table.paymentId),
  ],
);

export type PaymentEvent = typeof paymentEvents.$inferSelect;

/**
 * Configuration de paiement par tenant (`organizationId` null = plateforme).
 * Aucun secret ici : les clés viennent de l'environnement (STRIPE_SECRET_KEY,
 * STRIPE_WEBHOOK_SECRET) ; `stripeAccountId` (Stripe Connect, `acct_…`) est un
 * identifiant public.
 */
export const paymentSettings = pgTable(
  "payment_settings",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(false).notNull(),
    defaultCurrency: varchar("default_currency", { length: 3 }).default("EUR").notNull(),
    stripeAccountId: varchar("stripe_account_id", { length: 64 }),
    statementDescriptor: varchar("statement_descriptor", { length: 22 }),
    /** Durée de validité d'un lien de paiement (Stripe Checkout : 30 min à 24 h). */
    checkoutExpiryMinutes: integer("checkout_expiry_minutes").default(60).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    unique("payment_settings_org_uq").on(table.organizationId).nullsNotDistinct(),
    check("payment_settings_expiry_ck", sql`${table.checkoutExpiryMinutes} between 30 and 1440`),
  ],
);

export type PaymentSettings = typeof paymentSettings.$inferSelect;
