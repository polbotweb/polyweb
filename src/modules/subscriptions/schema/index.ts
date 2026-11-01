/**
 * Tables du domaine subscriptions (abonnements récurrents) :
 * - `subscription_plans` : formules vendues (nom, catégorie fiscale, nature de la prestation) ;
 * - `subscription_prices` : tarifs d'une formule (devise, montant TTC payé par le client, période) ;
 * - `subscriptions` : abonnements clients, miroir de l'abonnement du fournisseur de paiement.
 * Pas de révisions ni de verrous d'édition : l'état fait foi côté fournisseur (webhooks), et chaque
 * période facturée produit une facture Sales (traçabilité comptable).
 * Taxonomie : catégories propres au module, rattachées aux formules (`subscription_category_links.plan_id`).
 */
import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "@database/schemas/auth.schema";
import { LOCALES } from "@i18n/config";
import { CUSTOMER_TYPES, SUPPLY_TYPES, TAX_CATEGORIES } from "@/modules/tax/domain/rules";
import { BILLING_INTERVALS, SUBSCRIPTION_STATUSES } from "../domain/lifecycle";

export const subscriptionPlans = pgTable("subscription_plans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  taxCategory: text("tax_category", { enum: TAX_CATEGORIES }).default("standard").notNull(),
  supplyType: text("supply_type", { enum: SUPPLY_TYPES }).default("services").notNull(),
  active: boolean("active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("subscription_plans_org_slug_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.slug),
  index("subscription_plans_org_active_idx").on(table.organizationId, table.active),
]);

export const subscriptionPrices = pgTable("subscription_prices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  planId: text("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  currency: text("currency").default("EUR").notNull(),
  /** Montant TTC par période (ce que paie le client), en unités mineures. */
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  interval: text("interval", { enum: BILLING_INTERVALS }).default("month").notNull(),
  intervalCount: integer("interval_count").default(1).notNull(),
  trialDays: integer("trial_days").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("subscription_prices_plan_idx").on(table.planId),
  check("subscription_prices_amount_positive", sql`${table.amountMinor} > 0`),
  check("subscription_prices_interval_count", sql`${table.intervalCount} between 1 and 12`),
  check("subscription_prices_trial_days", sql`${table.trialDays} between 0 and 730`),
]);

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "restrict" }),
  priceId: text("price_id").notNull().references(() => subscriptionPrices.id, { onDelete: "restrict" }),
  /** Compte client propriétaire (portail) : seul lui peut résilier / reprendre depuis son espace. */
  customerUserId: text("customer_user_id").references(() => user.id, { onDelete: "set null" }),
  customerEmail: text("customer_email").notNull(),
  customerName: text("customer_name").notNull(),
  customerCountry: text("customer_country").notNull(),
  customerType: text("customer_type", { enum: CUSTOMER_TYPES }).default("B2C").notNull(),
  status: text("status", { enum: SUBSCRIPTION_STATUSES }).default("incomplete").notNull(),
  provider: text("provider").notNull(),
  providerSubscriptionId: text("provider_subscription_id"),
  providerCustomerId: text("provider_customer_id"),
  providerItemId: text("provider_item_id"),
  providerProductId: text("provider_product_id"),
  /** Session de paiement initiale (rapprochement avant le premier webhook). */
  checkoutSessionId: text("checkout_session_id"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("subscriptions_provider_subscription_uidx").on(table.provider, table.providerSubscriptionId).where(sql`${table.providerSubscriptionId} is not null`),
  index("subscriptions_org_status_idx").on(table.organizationId, table.status),
  index("subscriptions_customer_user_idx").on(table.customerUserId),
  index("subscriptions_plan_idx").on(table.planId),
]);

// ── Catégories (core/taxonomy) : tables propres au module, forme commune ──
export const subscriptionCategories = pgTable("subscription_categories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  parentId: text("parent_id").references((): AnyPgColumn => subscriptionCategories.id, { onDelete: "set null" }),
  slug: text("slug").notNull(),
  icon: text("icon"),
  color: text("color"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("subscription_categories_org_slug_uidx").on(table.organizationId, table.slug).where(sql`${table.organizationId} IS NOT NULL`),
  uniqueIndex("subscription_categories_global_slug_uidx").on(table.slug).where(sql`${table.organizationId} IS NULL`),
  index("subscription_categories_org_idx").on(table.organizationId),
  index("subscription_categories_parent_idx").on(table.parentId),
  check("subscription_categories_no_self_parent", sql`${table.parentId} IS NULL OR ${table.parentId} != ${table.id}`),
]);

/** Traductions des catégories (une par locale, sans repli). */
export const subscriptionCategoryTranslations = pgTable("subscription_category_translations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  categoryId: text("category_id").notNull().references(() => subscriptionCategories.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: LOCALES }).notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("subscription_category_translations_category_locale_uidx").on(table.categoryId, table.locale),
  uniqueIndex("subscription_category_translations_org_locale_slug_uidx").on(table.organizationId, table.locale, table.slug).where(sql`${table.organizationId} IS NOT NULL`),
  uniqueIndex("subscription_category_translations_global_locale_slug_uidx").on(table.locale, table.slug).where(sql`${table.organizationId} IS NULL`),
]);

/** Liaison explicite formule (plan) ↔ catégorie : la taxonomie du module classe les formules. */
export const subscriptionCategoryLinks = pgTable("subscription_category_links", {
  planId: text("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "cascade" }),
  categoryId: text("category_id").notNull().references(() => subscriptionCategories.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.planId, table.categoryId] }),
  index("subscription_category_links_category_idx").on(table.categoryId),
]);
