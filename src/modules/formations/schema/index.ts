/**
 * Tables du domaine formations : contenu, révisions et verrous d'édition.
 *
 * Exporté depuis `src/database/schemas.ts` puis `pnpm db:generate`
 * pour produire la migration (le générateur n'écrit aucune migration).
 */
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { organization, user } from "@database/schemas/auth.schema";
import { mediaFiles } from "@database/schemas/media.schema";
import { LOCALES } from "@i18n/config";
import { FORMATIONS_STATUSES } from "../domain/workflow";

/** Niveaux déclarés (union fermée, pas de texte libre). */
export const FORMATION_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type FormationLevel = (typeof FORMATION_LEVELS)[number];

/**
 * Formation = parcours certifiant (catalogue éditorial), contexte borné DISTINCT
 * des Courses (TODO §19.1/§19.2) : un parcours pourra agréger des cours via une
 * table de liaison dédiée côté module Courses. Inscription, progression,
 * certificats délivrés et paiement restent HORS du CMS Core : `priceMinor` et
 * `certificate` sont informatifs, aucune table transactionnelle ici.
 */
export const formations = pgTable("formations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: FORMATIONS_STATUSES }).default("DRAFT").notNull(),
  level: text("level", { enum: FORMATION_LEVELS }),
  durationHours: integer("duration_hours"),
  priceMinor: integer("price_minor"),
  currency: varchar("currency", { length: 3 }),
  certificate: boolean("certificate").default(false).notNull(),
  coverImageId: text("cover_image_id").references(() => mediaFiles.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("formations_org_slug_uidx").on(table.organizationId, table.slug),
  index("formations_org_idx").on(table.organizationId),
  index("formations_status_idx").on(table.status),
  check("formations_duration_positive", sql`${table.durationHours} IS NULL OR ${table.durationHours} > 0`),
  check("formations_price_non_negative", sql`${table.priceMinor} IS NULL OR ${table.priceMinor} >= 0`),
]);

/** Localisation relationnelle (pas de JSONB) : une ligne par locale. */
export const formationTranslations = pgTable("formation_translations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  formationId: text("formation_id").notNull().references(() => formations.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: LOCALES }).notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  excerpt: text("excerpt"),
  content: text("content").notNull().default(""),
  objectives: text("objectives"),
  prerequisites: text("prerequisites"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("formation_translations_formation_locale_uidx").on(table.formationId, table.locale),
  uniqueIndex("formation_translations_org_locale_slug_uidx").on(table.organizationId, table.locale, table.slug).where(sql`${table.organizationId} IS NOT NULL`),
  uniqueIndex("formation_translations_global_locale_slug_uidx").on(table.locale, table.slug).where(sql`${table.organizationId} IS NULL`),
]);

/** Révisions (core/revision) : une ligne par écriture, pour l'historique et la restauration. */
export const formationsRevisions = pgTable("formations_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => formations.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: FORMATIONS_STATUSES }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("formations_revisions_resource_idx").on(table.resourceId)]);

/** Verrous d'édition (core/locks) : une ligne par ressource, propriétaire utilisateur + session. */
export const formationsLocks = pgTable("formations_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => formations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});
