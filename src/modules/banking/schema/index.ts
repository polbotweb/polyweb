/**
 * Tables du domaine banking : contenu, révisions et verrous d'édition.
 *
 * À exporter depuis `src/database/schemas.ts` puis `pnpm db:generate`
 * pour produire la migration (le générateur n'écrit aucune migration).
 */
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "@database/schemas/auth.schema";
import { BANKING_STATUSES } from "../domain/workflow";

export const banking = pgTable("bank_statements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id"),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: BANKING_STATUSES }).default("DRAFT").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [uniqueIndex("bank_statements_org_slug_uidx").on(table.organizationId, table.slug)]);

/** Révisions (core/revision) : une ligne par écriture, pour l'historique et la restauration. */
export const statementRevisions = pgTable("statement_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => banking.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: BANKING_STATUSES }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("statement_revisions_resource_idx").on(table.resourceId)]);

/** Verrous d'édition (core/locks) : une ligne par ressource, propriétaire utilisateur + session. */
export const statementLocks = pgTable("statement_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => banking.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});
