/**
 * Tables du paramétrage comptable (core/accounting), partagées par ventes, achats et banque.
 * Exportées depuis `src/database/schemas.ts` ; migration 0058.
 */
import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user } from "@database/schemas/auth.schema";
import { ACCOUNT_KINDS, type AccountRole, type Journal, type JournalKind } from "./chart";

/** Comptes ajoutés ou renommés par une organisation (le plan par défaut reste implicite). */
export const accountingAccounts = pgTable("accounting_accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  label: text("label").notNull(),
  kind: text("kind", { enum: ACCOUNT_KINDS }).notNull(),
  active: boolean("active").default(true).notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [uniqueIndex("accounting_accounts_org_code_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.code)]);

/** Rôles comptables et journaux surchargés par une organisation (absent = défauts). */
export const accountingSettings = pgTable("accounting_settings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  roleCodes: jsonb("role_codes").$type<Partial<Record<AccountRole, string>>>().default({}).notNull(),
  journals: jsonb("journals").$type<Partial<Record<JournalKind, Journal>>>().default({}).notNull(),
  letteringEnabled: boolean("lettering_enabled").default(true).notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [uniqueIndex("accounting_settings_org_uidx").on(sql`coalesce(${table.organizationId}, '')`)]);
