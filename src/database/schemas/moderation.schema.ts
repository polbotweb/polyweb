import { pgTable, text, varchar, timestamp, jsonb, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user, organization } from "./auth.schema";

/**
 * Modération générique (core/moderation, docs/moderation.md).
 *
 * La visibilité métier reste la source de vérité des tables de module (ex. `blog_comments.status`) :
 * ces tables n'enregistrent que les signalements et l'historique motivé des décisions.
 * Cible = (`module`, `target_type`, `target_id`) résolue par l'adaptateur du module ; pas de clé
 * étrangère vers les tables de module (nettoyage par triggers, migration 0053).
 */
export const MODERATION_REPORT_REASONS = ["spam", "abusive", "off_topic", "hate_speech", "other"] as const;
export const MODERATION_REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;
export const MODERATION_ACTIONS = [
  // Décisions génériques (registre) :
  "hide", "restore", "spam", "resolve", "dismiss",
  // Flux d'approbation propre au blog (historique `blog_comment_moderations`, migration 0053) :
  "approve", "reject", "trash", "reset", "edit",
] as const;

export type ModerationReportReason = (typeof MODERATION_REPORT_REASONS)[number];
export type ModerationReportStatus = (typeof MODERATION_REPORT_STATUSES)[number];
export type ModerationActionName = (typeof MODERATION_ACTIONS)[number];

export const moderationReports = pgTable(
  "moderation_reports",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    module: varchar("module", { length: 40 }).notNull(),
    targetType: varchar("target_type", { length: 40 }).notNull(),
    targetId: text("target_id").notNull(),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    /** Empreinte HMAC salée du signaleur (`u:` utilisateur, `a:` IP) ; `legacy:<id>` pour les lignes migrées. */
    reporterKey: varchar("reporter_key", { length: 96 }).notNull(),
    reason: varchar("reason", { length: 20, enum: MODERATION_REPORT_REASONS }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 12, enum: MODERATION_REPORT_STATUSES }).default("open").notNull(),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** Valeurs d'origine des tables historiques (table, statut, motif) : retour arrière exact de 0053. */
    legacy: jsonb("legacy").$type<Record<string, unknown>>(),
  },
  (table) => [
    // Dédoublonnage : un seul signalement ouvert par signaleur et par cible (clé jamais nulle).
    uniqueIndex("moderation_reports_open_dedupe_uidx")
      .on(table.module, table.targetType, table.targetId, table.reporterKey)
      .where(sql`${table.status} = 'open'`),
    index("moderation_reports_queue_idx").on(table.organizationId, table.status, table.createdAt),
    index("moderation_reports_target_idx").on(table.module, table.targetType, table.targetId),
    index("moderation_reports_reporter_idx").on(table.reporterId),
    check("moderation_reports_reason_check", sql`${table.reason} IN ('spam', 'abusive', 'off_topic', 'hate_speech', 'other')`),
    check("moderation_reports_status_check", sql`${table.status} IN ('open', 'resolved', 'dismissed')`),
  ],
);

export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    module: varchar("module", { length: 40 }).notNull(),
    targetType: varchar("target_type", { length: 40 }).notNull(),
    targetId: text("target_id").notNull(),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: varchar("action", { length: 20, enum: MODERATION_ACTIONS }).notNull(),
    /** Motif codifié (`spam`, `abusive`…) ; `note` = motivation libre du modérateur. */
    reasonCode: varchar("reason_code", { length: 40 }),
    note: text("note"),
    fromStatus: varchar("from_status", { length: 20 }),
    toStatus: varchar("to_status", { length: 20 }),
    /** Valeurs avant décision (modérateurs seulement ; jamais dans l'audit ni l'outbox). */
    previousValues: jsonb("previous_values").$type<Record<string, unknown>>(),
    legacy: jsonb("legacy").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("moderation_actions_target_idx").on(table.module, table.targetType, table.targetId, table.createdAt),
    index("moderation_actions_org_idx").on(table.organizationId, table.createdAt),
    index("moderation_actions_actor_idx").on(table.actorId),
  ],
);

export type ModerationReport = typeof moderationReports.$inferSelect;
export type ModerationAction = typeof moderationActions.$inferSelect;
