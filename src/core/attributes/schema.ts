/**
 * Persistance générique des attributs dynamiques (core/attributes).
 *
 * Définitions typées, rattachées à un propriétaire (`module` + `owner_type` + `owner_id`,
 * ex. une catégorie de petites annonces). Traductions des libellés et des options en
 * fr/en/es/ar. Les valeurs sont typées (pas de JSON fourre-tout). Premier consommateur :
 * le module classifieds ; l'EAV historique des services n'est pas migré ici.
 */
import { sql } from "drizzle-orm";
import { boolean, check, date, doublePrecision, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { LOCALES } from "@i18n/config";
import { ATTRIBUTE_KINDS } from "./kinds";

export const attributeDefinitions = pgTable("attribute_definitions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  module: varchar("module", { length: 40 }).notNull(),
  ownerType: varchar("owner_type", { length: 40 }).notNull(),
  ownerId: text("owner_id").notNull(),
  key: varchar("key", { length: 64 }).notNull(),
  kind: varchar("kind", { length: 16, enum: ATTRIBUTE_KINDS }).notNull(),
  required: boolean("required").default(false).notNull(),
  filterable: boolean("filterable").default(true).notNull(),
  unit: varchar("unit", { length: 24 }),
  minValue: doublePrecision("min_value"),
  maxValue: doublePrecision("max_value"),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  uniqueIndex("attribute_definitions_owner_key_uidx").on(t.module, t.ownerType, t.ownerId, t.key),
  index("attribute_definitions_owner_idx").on(t.module, t.ownerType, t.ownerId, t.position),
  check("attribute_definitions_kind_check", sql`${t.kind} IN ('text', 'number', 'integer', 'boolean', 'select', 'multiselect', 'date')`),
  check("attribute_definitions_key_check", sql`${t.key} ~ '^[a-z][a-z0-9_]{0,63}$'`),
]);

export const attributeDefinitionTranslations = pgTable("attribute_definition_translations", {
  definitionId: text("definition_id").notNull().references(() => attributeDefinitions.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: LOCALES }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  description: text("description"),
}, (t) => [
  primaryKey({ columns: [t.definitionId, t.locale], name: "attribute_definition_translations_pkey" }),
]);

export const attributeOptions = pgTable("attribute_options", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  definitionId: text("definition_id").notNull().references(() => attributeDefinitions.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 64 }).notNull(),
  position: integer("position").default(0).notNull(),
}, (t) => [
  uniqueIndex("attribute_options_definition_key_uidx").on(t.definitionId, t.key),
  index("attribute_options_order_idx").on(t.definitionId, t.position),
  check("attribute_options_key_check", sql`${t.key} ~ '^[a-z0-9][a-z0-9_]{0,63}$'`),
]);

export const attributeOptionTranslations = pgTable("attribute_option_translations", {
  optionId: text("option_id").notNull().references(() => attributeOptions.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: LOCALES }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.optionId, t.locale], name: "attribute_option_translations_pkey" }),
]);

/** Une ligne de valeur typée par définition et par ressource. */
export const attributeValues = pgTable("attribute_values", {
  definitionId: text("definition_id").notNull().references(() => attributeDefinitions.id, { onDelete: "cascade" }),
  resourceType: varchar("resource_type", { length: 40 }).notNull(),
  resourceId: text("resource_id").notNull(),
  textValue: text("text_value"),
  numberValue: doublePrecision("number_value"),
  booleanValue: boolean("boolean_value"),
  dateValue: date("date_value", { mode: "string" }),
  optionId: text("option_id").references(() => attributeOptions.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  primaryKey({ columns: [t.definitionId, t.resourceType, t.resourceId], name: "attribute_values_pkey" }),
  index("attribute_values_resource_idx").on(t.resourceType, t.resourceId),
  index("attribute_values_option_idx").on(t.optionId),
]);

/** Choix multiples (`multiselect`) : une ligne par option retenue. */
export const attributeValueOptions = pgTable("attribute_value_options", {
  definitionId: text("definition_id").notNull().references(() => attributeDefinitions.id, { onDelete: "cascade" }),
  resourceType: varchar("resource_type", { length: 40 }).notNull(),
  resourceId: text("resource_id").notNull(),
  optionId: text("option_id").notNull().references(() => attributeOptions.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.definitionId, t.resourceType, t.resourceId, t.optionId], name: "attribute_value_options_pkey" }),
  index("attribute_value_options_resource_idx").on(t.resourceType, t.resourceId),
]);
