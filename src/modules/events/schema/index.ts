/**
 * Tables du domaine events : contenu, révisions et verrous d'édition.
 *
 * Exporté depuis `src/database/schemas.ts` puis `pnpm db:generate`
 * pour produire la migration (le générateur n'écrit aucune migration).
 */
import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { organization, user } from "@database/schemas/auth.schema";
import { mediaFiles } from "@database/schemas/media.schema";
import { LOCALES } from "@i18n/config";
import { EVENTS_STATUSES } from "../domain/workflow";

/**
 * Événement (catalogue éditorial). L'inscription / la réservation restent HORS
 * du CMS Core (TODO §19.4) : `capacity` et `priceMinor` sont informatifs, aucune
 * table d'inscription ici.
 */
export const events = pgTable("events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: EVENTS_STATUSES }).default("DRAFT").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  timezone: text("timezone"),
  capacity: integer("capacity"),
  priceMinor: integer("price_minor"),
  currency: varchar("currency", { length: 3 }),
  coverImageId: text("cover_image_id").references(() => mediaFiles.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("events_org_slug_uidx").on(table.organizationId, table.slug),
  index("events_org_idx").on(table.organizationId),
  index("events_status_starts_idx").on(table.status, table.startsAt),
  check("events_dates_order", sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} >= ${table.startsAt}`),
  check("events_capacity_positive", sql`${table.capacity} IS NULL OR ${table.capacity} > 0`),
  check("events_price_non_negative", sql`${table.priceMinor} IS NULL OR ${table.priceMinor} >= 0`),
]);

/** Localisation relationnelle (pas de JSONB) : une ligne par locale. */
export const eventTranslations = pgTable("event_translations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: LOCALES }).notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  excerpt: text("excerpt"),
  content: text("content").notNull().default(""),
  venueName: text("venue_name"),
  venueAddress: text("venue_address"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("event_translations_event_locale_uidx").on(table.eventId, table.locale),
  uniqueIndex("event_translations_org_locale_slug_uidx").on(table.organizationId, table.locale, table.slug).where(sql`${table.organizationId} IS NOT NULL`),
  uniqueIndex("event_translations_global_locale_slug_uidx").on(table.locale, table.slug).where(sql`${table.organizationId} IS NULL`),
]);

/** Révisions (core/revision) : une ligne par écriture, pour l'historique et la restauration. */
export const eventsRevisions = pgTable("events_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: EVENTS_STATUSES }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("events_revisions_resource_idx").on(table.resourceId)]);

/** Verrous d'édition (core/locks) : une ligne par ressource, propriétaire utilisateur + session. */
export const eventsLocks = pgTable("events_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => events.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

/**
 * Catégories (core/taxonomy, contrat générique `defineCategoryTaxonomy`) : tables PROPRES
 * au module (pas de table polymorphe), forme commune du cœur, hiérarchie via `parent_id`.
 */
export const eventCategories = pgTable("event_categories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  parentId: text("parent_id").references((): AnyPgColumn => eventCategories.id, { onDelete: "set null" }),
  slug: text("slug").notNull(),
  icon: text("icon"),
  color: text("color"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("event_categories_org_slug_uidx").on(table.organizationId, table.slug).where(sql`${table.organizationId} IS NOT NULL`),
  uniqueIndex("event_categories_global_slug_uidx").on(table.slug).where(sql`${table.organizationId} IS NULL`),
  index("event_categories_org_idx").on(table.organizationId),
  index("event_categories_parent_idx").on(table.parentId),
  check("event_categories_no_self_parent", sql`${table.parentId} IS NULL OR ${table.parentId} != ${table.id}`),
]);

/** Traductions des catégories : une ligne par locale (pas de JSONB). */
export const eventCategoryTranslations = pgTable("event_category_translations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  categoryId: text("category_id").notNull().references(() => eventCategories.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: LOCALES }).notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("event_category_translations_category_locale_uidx").on(table.categoryId, table.locale),
  uniqueIndex("event_category_translations_org_locale_slug_uidx").on(table.organizationId, table.locale, table.slug).where(sql`${table.organizationId} IS NOT NULL`),
  uniqueIndex("event_category_translations_global_locale_slug_uidx").on(table.locale, table.slug).where(sql`${table.organizationId} IS NULL`),
]);

/** Liaison explicite event ↔ catégorie. */
export const eventCategoryLinks = pgTable("event_category_links", {
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  categoryId: text("category_id").notNull().references(() => eventCategories.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.eventId, table.categoryId] }),
  index("event_category_links_category_idx").on(table.categoryId),
]);
