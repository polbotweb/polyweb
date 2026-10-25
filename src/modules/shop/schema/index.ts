/**
 * Tables du domaine shop : contenu, révisions et verrous d'édition.
 *
 * Exporté depuis `src/database/schemas.ts` puis `pnpm db:generate`
 * pour produire la migration (le générateur n'écrit aucune migration).
 */
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { organization, user } from "@database/schemas/auth.schema";
import { mediaFiles } from "@database/schemas/media.schema";
import { LOCALES } from "@i18n/config";
import { SHOP_STATUSES } from "../domain/workflow";

/**
 * Produit du CATALOGUE (TODO §19.3). Panier, commande, paiement, stock,
 * expédition et remboursement restent HORS du CMS Core : aucune table ici.
 * La variable garde le nom généré (`shop`) ; la table SQL est `shop_products`.
 */
export const shop = pgTable("shop_products", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: SHOP_STATUSES }).default("DRAFT").notNull(),
  coverImageId: text("cover_image_id").references(() => mediaFiles.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("shop_org_slug_uidx").on(table.organizationId, table.slug),
  index("shop_products_org_idx").on(table.organizationId),
  index("shop_products_status_idx").on(table.status),
]);

/** Localisation relationnelle (pas de JSONB) : une ligne par locale. */
export const productTranslations = pgTable("product_translations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id").notNull().references(() => shop.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: LOCALES }).notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  excerpt: text("excerpt"),
  content: text("content").notNull().default(""),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("product_translations_product_locale_uidx").on(table.productId, table.locale),
  uniqueIndex("product_translations_org_locale_slug_uidx").on(table.organizationId, table.locale, table.slug).where(sql`${table.organizationId} IS NOT NULL`),
  uniqueIndex("product_translations_global_locale_slug_uidx").on(table.locale, table.slug).where(sql`${table.organizationId} IS NULL`),
]);

/**
 * Modèle de variantes : options déclarées par produit (ex. « taille »), valeurs
 * ordonnées (ex. « M »), variantes = combinaison de valeurs. Attributs typés par
 * tables (pas d'EAV JSON, pas de Record<string, unknown>).
 */
export const productOptions = pgTable("product_options", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id").notNull().references(() => shop.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 64 }).notNull(),
  position: integer("position").notNull(),
}, (table) => [
  uniqueIndex("product_options_product_code_uidx").on(table.productId, table.code),
  uniqueIndex("product_options_product_position_uidx").on(table.productId, table.position),
]);

export const productOptionTranslations = pgTable("product_option_translations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  optionId: text("option_id").notNull().references(() => productOptions.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: LOCALES }).notNull(),
  name: text("name").notNull(),
}, (table) => [uniqueIndex("product_option_translations_option_locale_uidx").on(table.optionId, table.locale)]);

export const productOptionValues = pgTable("product_option_values", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  optionId: text("option_id").notNull().references(() => productOptions.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 64 }).notNull(),
  position: integer("position").notNull(),
}, (table) => [
  uniqueIndex("product_option_values_option_code_uidx").on(table.optionId, table.code),
  uniqueIndex("product_option_values_option_position_uidx").on(table.optionId, table.position),
]);

export const productOptionValueTranslations = pgTable("product_option_value_translations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  valueId: text("value_id").notNull().references(() => productOptionValues.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: LOCALES }).notNull(),
  label: text("label").notNull(),
}, (table) => [uniqueIndex("product_option_value_translations_value_locale_uidx").on(table.valueId, table.locale)]);

/**
 * Variante vendable du catalogue. `available` = disponibilité ÉDITORIALE
 * (affichage) ; le stock réel appartient au domaine transactionnel Inventory.
 */
export const productVariants = pgTable("product_variants", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id").notNull().references(() => shop.id, { onDelete: "cascade" }),
  sku: varchar("sku", { length: 64 }).notNull(),
  position: integer("position").notNull(),
  priceMinor: integer("price_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  available: boolean("available").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("product_variants_sku_uidx").on(table.productId, table.sku),
  uniqueIndex("product_variants_product_position_uidx").on(table.productId, table.position),
  check("product_variants_price_non_negative", sql`${table.priceMinor} >= 0`),
]);

/** Combinaison variante ↔ valeurs d'option (une valeur par option et par variante). */
export const productVariantOptionValues = pgTable("product_variant_option_values", {
  variantId: text("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
  optionId: text("option_id").notNull().references(() => productOptions.id, { onDelete: "cascade" }),
  valueId: text("value_id").notNull().references(() => productOptionValues.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("product_variant_option_values_variant_option_uidx").on(table.variantId, table.optionId),
  index("product_variant_option_values_value_idx").on(table.valueId),
]);

/** Révisions (core/revision) : une ligne par écriture, pour l'historique et la restauration. */
export const shopRevisions = pgTable("shop_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => shop.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: SHOP_STATUSES }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("shop_revisions_resource_idx").on(table.resourceId)]);

/** Verrous d'édition (core/locks) : une ligne par ressource, propriétaire utilisateur + session. */
export const shopLocks = pgTable("shop_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => shop.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});
