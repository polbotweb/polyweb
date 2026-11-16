/**
 * Tables du domaine petites annonces (migration 0056) et réglages par site.
 * Les définitions d'attributs dynamiques vivent dans core/attributes.
 */
import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, customType, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { organization, user } from "@database/schemas/auth.schema";
import { sites } from "@database/schemas/content.schema";
import { mediaFiles } from "@database/schemas/media.schema";
import { LOCALES } from "@i18n/config";
import { messagingConversations } from "@database/schemas/messaging.schema";
import { CLASSIFIED_CONDITIONS, CLASSIFIED_KINDS, CLASSIFIED_LIFECYCLES, CLASSIFIED_PRICE_KINDS, CLASSIFIED_VISIBILITIES, MODERATION_STATUSES } from "../domain/workflow";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const classifiedSiteSettings = pgTable("classified_site_settings", {
  siteId: text("site_id").primaryKey().references(() => sites.id, { onDelete: "cascade" }),
  visibility: varchar("visibility", { length: 16, enum: CLASSIFIED_VISIBILITIES }).default("public").notNull(),
  preModeration: boolean("pre_moderation").default(true).notNull(),
  durationDays: integer("duration_days").default(30).notNull(),
  defaultCurrency: varchar("default_currency", { length: 3 }).default("EUR").notNull(),
  maxImages: integer("max_images").default(8).notNull(),
  maxRenewals: integer("max_renewals").default(3).notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("classified_site_settings_visibility", sql`${t.visibility} IN ('public', 'members', 'org')`),
  check("classified_site_settings_bounds", sql`${t.durationDays} BETWEEN 7 AND 90 AND ${t.maxImages} BETWEEN 1 AND 8 AND ${t.maxRenewals} BETWEEN 0 AND 20`),
]);

export const classifiedCategories = pgTable("classified_categories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  parentId: text("parent_id").references((): AnyPgColumn => classifiedCategories.id, { onDelete: "restrict" }),
  slug: varchar("slug", { length: 80 }).notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  uniqueIndex("classified_categories_site_slug_uidx").on(t.siteId, t.slug),
  index("classified_categories_parent_idx").on(t.siteId, t.parentId, t.position),
]);

export const classifiedCategoryTranslations = pgTable("classified_category_translations", {
  categoryId: text("category_id").notNull().references(() => classifiedCategories.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: LOCALES }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
}, (t) => [
  primaryKey({ columns: [t.categoryId, t.locale], name: "classified_category_translations_pkey" }),
]);

export const classifiedAds = pgTable("classified_ads", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
  authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
  categoryId: text("category_id").notNull().references(() => classifiedCategories.id, { onDelete: "restrict" }),
  slug: varchar("slug", { length: 120 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  body: text("body").notNull(),
  bodyHtml: text("body_html").notNull(),
  kind: varchar("kind", { length: 12, enum: CLASSIFIED_KINDS }).default("offer").notNull(),
  condition: varchar("condition", { length: 12, enum: CLASSIFIED_CONDITIONS }).default("n_a").notNull(),
  priceKind: varchar("price_kind", { length: 16, enum: CLASSIFIED_PRICE_KINDS }).default("fixed").notNull(),
  priceMinor: integer("price_minor"),
  currency: varchar("currency", { length: 3 }),
  city: varchar("city", { length: 120 }).notNull(),
  postalCode: varchar("postal_code", { length: 20 }),
  country: varchar("country", { length: 2 }),
  coverImageId: text("cover_image_id").references(() => mediaFiles.id, { onDelete: "set null" }),
  lifecycle: varchar("lifecycle", { length: 16, enum: CLASSIFIED_LIFECYCLES }).default("draft").notNull(),
  moderationStatus: varchar("moderation_status", { length: 12, enum: MODERATION_STATUSES }).default("visible").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  renewedAt: timestamp("renewed_at", { withTimezone: true }),
  renewCount: integer("renew_count").default(0).notNull(),
  soldAt: timestamp("sold_at", { withTimezone: true }),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  searchVector: tsvector("search_vector").generatedAlwaysAs(sql`to_tsvector('simple'::regconfig, coalesce("title", '') || ' ' || coalesce("body", '') || ' ' || coalesce("city", ''))`),
}, (t) => [
  uniqueIndex("classified_ads_site_slug_uidx").on(t.siteId, t.slug),
  index("classified_ads_list_idx").on(t.siteId, t.lifecycle, t.moderationStatus, t.publishedAt),
  index("classified_ads_category_idx").on(t.categoryId, t.lifecycle, t.moderationStatus),
  index("classified_ads_author_idx").on(t.authorId, t.siteId, t.lifecycle),
  index("classified_ads_expires_idx").on(t.lifecycle, t.expiresAt),
  index("classified_ads_search_idx").using("gin", t.searchVector),
  check("classified_ads_kind_check", sql`${t.kind} IN ('offer', 'wanted')`),
  check("classified_ads_condition_check", sql`${t.condition} IN ('new', 'used', 'n_a')`),
  check("classified_ads_price_kind_check", sql`${t.priceKind} IN ('fixed', 'free', 'on_request')`),
  check("classified_ads_lifecycle_check", sql`${t.lifecycle} IN ('draft', 'pending', 'published', 'expired', 'sold', 'archived')`),
  check("classified_ads_moderation_check", sql`${t.moderationStatus} IN ('visible', 'hidden', 'spam')`),
  check("classified_ads_price_non_negative", sql`${t.priceMinor} IS NULL OR ${t.priceMinor} >= 0`),
]);

export const classifiedAdMedia = pgTable("classified_ad_media", {
  adId: text("ad_id").notNull().references(() => classifiedAds.id, { onDelete: "cascade" }),
  mediaId: text("media_id").notNull().references(() => mediaFiles.id, { onDelete: "cascade" }),
  altText: varchar("alt_text", { length: 200 }).notNull(),
  position: integer("position").default(0).notNull(),
}, (t) => [
  primaryKey({ columns: [t.adId, t.mediaId], name: "classified_ad_media_pkey" }),
  index("classified_ad_media_ad_idx").on(t.adId, t.position),
]);

export const classifiedFavorites = pgTable("classified_favorites", {
  adId: text("ad_id").notNull().references(() => classifiedAds.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.adId, t.userId], name: "classified_favorites_pkey" }),
  index("classified_favorites_user_idx").on(t.userId, t.createdAt),
]);

export const classifiedSavedSearches = pgTable("classified_saved_searches", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }),
  query: varchar("query", { length: 200 }),
  categoryId: text("category_id").references(() => classifiedCategories.id, { onDelete: "set null" }),
  kind: varchar("kind", { length: 12, enum: CLASSIFIED_KINDS }),
  condition: varchar("condition", { length: 12, enum: CLASSIFIED_CONDITIONS }),
  priceMinMinor: integer("price_min_minor"),
  priceMaxMinor: integer("price_max_minor"),
  currency: varchar("currency", { length: 3 }),
  city: varchar("city", { length: 120 }),
  postalCode: varchar("postal_code", { length: 20 }),
  notify: boolean("notify").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("classified_saved_searches_user_idx").on(t.userId, t.siteId),
]);

/** Filtres d'attribut typés d'une recherche sauvée (pas de JSON fourre-tout). */
export const classifiedSavedSearchFilters = pgTable("classified_saved_search_filters", {
  searchId: text("search_id").notNull().references(() => classifiedSavedSearches.id, { onDelete: "cascade" }),
  definitionKey: varchar("definition_key", { length: 64 }).notNull(),
  textValue: text("text_value"),
  numberMin: integer("number_min"),
  numberMax: integer("number_max"),
  booleanValue: boolean("boolean_value"),
  optionKey: varchar("option_key", { length: 64 }),
}, (t) => [
  primaryKey({ columns: [t.searchId, t.definitionKey], name: "classified_saved_search_filters_pkey" }),
]);

export const classifiedInquiries = pgTable("classified_inquiries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  adId: text("ad_id").notNull().references(() => classifiedAds.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => messagingConversations.id, { onDelete: "cascade" }),
  buyerId: text("buyer_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sellerId: text("seller_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("classified_inquiries_ad_buyer_uidx").on(t.adId, t.buyerId),
  index("classified_inquiries_conversation_idx").on(t.conversationId),
]);
