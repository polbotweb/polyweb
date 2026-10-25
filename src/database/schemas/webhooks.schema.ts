import { pgTable, text, varchar, timestamp, jsonb, boolean, integer, index } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { sites } from "./content.schema";

/**
 * Webhooks sortants signés (brique d).
 * Le secret de signature est chiffré au repos (AES-256-GCM, clé dérivée de
 * POLYWEB_SIGNING_SECRET) : il doit être relu pour signer, donc pas hachable.
 */
export const webhooks = pgTable(
  "webhooks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    url: varchar("url", { length: 2000 }).notNull(),
    /** `v1:<iv>:<tag>:<ciphertext>` en base64url. */
    secretEncrypted: text("secret_encrypted").notNull(),
    /** Motifs d'événements : `content.published`, `content.*`, `*`. */
    events: jsonb("events").$type<string[]>().default(["*"]).notNull(),
    active: boolean("active").default(true).notNull(),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    disabledReason: varchar("disabled_reason", { length: 300 }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [index("webhooks_site_idx").on(t.siteId)],
);

export const WEBHOOK_DELIVERY_STATUSES = ["pending", "success", "failed", "dead"] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    webhookId: text("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    event: varchar("event", { length: 80 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** pending = à (re)tenter, failed = dernier essai en échec mais retentable, dead = abandonné. */
    status: varchar("status", { length: 16 }).$type<WebhookDeliveryStatus>().default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow(),
    /** Verrou de traitement (évite deux workers sur la même livraison). */
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastStatusCode: integer("last_status_code"),
    lastError: varchar("last_error", { length: 500 }),
    responseSnippet: varchar("response_snippet", { length: 1000 }),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt),
    index("webhook_deliveries_hook_idx").on(t.webhookId, t.createdAt),
  ],
);
