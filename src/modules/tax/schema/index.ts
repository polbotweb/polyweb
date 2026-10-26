/**
 * Tables du domaine tax : taux de TVA par pays / catégorie / type de client (surcharges
 * des taux par défaut de `domain/rates.ts`, avec période de validité), révisions et verrous.
 * Taux en `numeric(7,4)` (chaîne décimale exacte, compatible core/money).
 *
 * À exporter depuis `src/database/schemas.ts` puis `pnpm db:generate`
 * pour produire la migration (le générateur n'écrit aucune migration).
 */
import { date, index, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "@database/schemas/auth.schema";
import { TAX_STATUSES } from "../domain/workflow";
import { CUSTOMER_TYPES, TAX_CATEGORIES } from "../domain/rules";

export const tax = pgTable("tax_rates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id"),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: TAX_STATUSES }).default("DRAFT").notNull(),
  countryCode: text("country_code").notNull(),
  category: text("category", { enum: TAX_CATEGORIES }).default("standard").notNull(),
  /** null = B2B et B2C. */
  customerType: text("customer_type", { enum: CUSTOMER_TYPES }),
  ratePercent: numeric("rate_percent", { precision: 7, scale: 4 }).notNull(),
  validFrom: date("valid_from", { mode: "string" }),
  validTo: date("valid_to", { mode: "string" }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("tax_rates_org_slug_uidx").on(table.organizationId, table.slug),
  index("tax_rates_lookup_idx").on(table.organizationId, table.countryCode, table.category),
]);

/** Révisions (core/revision) : une ligne par écriture, pour l'historique et la restauration. */
export const taxRateRevisions = pgTable("tax_rate_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => tax.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: TAX_STATUSES }).notNull(),
  countryCode: text("country_code").notNull(),
  category: text("category", { enum: TAX_CATEGORIES }).notNull(),
  customerType: text("customer_type", { enum: CUSTOMER_TYPES }),
  ratePercent: numeric("rate_percent", { precision: 7, scale: 4 }).notNull(),
  validFrom: date("valid_from", { mode: "string" }),
  validTo: date("valid_to", { mode: "string" }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("tax_rate_revisions_resource_idx").on(table.resourceId)]);

/** Verrous d'édition (core/locks) : une ligne par ressource, propriétaire utilisateur + session. */
export const taxRateLocks = pgTable("tax_rate_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => tax.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});
