import { pgTable, text, varchar, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";

/**
 * Outbox transactionnelle des événements métier (`core/events/outbox`).
 * Une ligne est écrite dans la MÊME transaction que le changement d'état : l'événement
 * n'existe que si l'écriture est validée (pas de webhook fantôme sur ROLLBACK). Elle est
 * diffusée après commit puis, en cas d'échec ou de redémarrage, par le cron des webhooks.
 * `id` = identifiant de l'événement : la mise en file des livraisons est idempotente
 * (unicité `webhook_id` + `event_id`), donc chaque webhook reçoit l'événement une seule fois.
 */
export const eventOutbox = pgTable(
  "event_outbox",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: varchar("name", { length: 80 }).notNull(),
    /** Tenant ERP (`null` = plateforme). */
    organizationId: text("organization_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    attempts: integer("attempts").default(0).notNull(),
    lastError: varchar("last_error", { length: 500 }),
  },
  (t) => [index("event_outbox_pending_idx").on(t.dispatchedAt, t.occurredAt)],
);
