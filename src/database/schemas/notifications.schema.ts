import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, integer, boolean, index, uniqueIndex, primaryKey, check } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.schema";

/**
 * Notifications in-app communes à tous les modules (`core/notifications`).
 * `module` + `type` désignent une définition du registre ; `resourceType`/`resourceId` la cible
 * principale (ex. `post`, `service`) et `data` les références secondaires (commentaire, avis…).
 * `dedupeKey` (unique) rend la création idempotente (rediffusion d'outbox, cron de rappels).
 * Reprend sans perte `blog_notifications` et `service_notifications` (migration 0052, réversible).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    module: varchar("module", { length: 40 }).notNull(),
    type: varchar("type", { length: 80 }).notNull(),
    category: varchar("category", { length: 40 }).notNull(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    resourceType: varchar("resource_type", { length: 40 }),
    resourceId: text("resource_id"),
    data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
    title: text("title"),
    message: text("message"),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    dedupeKey: varchar("dedupe_key", { length: 200 }),
  },
  (t) => [
    index("notifications_user_unread_idx").on(t.userId, t.readAt, t.createdAt),
    index("notifications_org_user_idx").on(t.organizationId, t.userId),
    index("notifications_resource_idx").on(t.module, t.resourceType, t.resourceId),
    index("notifications_created_idx").on(t.createdAt),
    uniqueIndex("notifications_dedupe_uidx").on(t.dedupeKey),
  ],
);

/** Préférences par utilisateur, catégorie et canal ; absence de ligne = défaut de la catégorie. */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 40 }).notNull(),
    channel: varchar("channel", { length: 20, enum: ["in_app", "email"] }).notNull(),
    enabled: boolean("enabled").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category, t.channel] })],
);

/**
 * File d'emails transactionnels (hors authentification, envoyée en direct). Écrite dans la
 * transaction métier, envoyée par le cron `email-outbox` avec retries ; `dedupeKey` unique.
 * L'adresse n'est jamais journalisée ; `lastError` ne contient que le code d'erreur.
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    dedupeKey: varchar("dedupe_key", { length: 200 }).notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    toEmail: text("to_email").notNull(),
    locale: varchar("locale", { length: 5 }).notNull(),
    template: varchar("template", { length: 120 }).notNull(),
    category: varchar("category", { length: 40 }).notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
    status: varchar("status", { length: 12, enum: ["pending", "sent", "failed", "cancelled"] }).default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastError: varchar("last_error", { length: 120 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("email_outbox_dedupe_uidx").on(t.dedupeKey),
    index("email_outbox_due_idx").on(t.status, t.nextAttemptAt),
    check("email_outbox_attempts_check", sql`${t.attempts} >= 0`),
  ],
);
