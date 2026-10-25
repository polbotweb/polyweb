/**
 * Tables du domaine events : contenu, révisions et verrous d'édition.
 *
 * À exporter depuis `src/database/schemas/index.ts` puis `pnpm db:generate`
 * pour produire la migration (le générateur n'écrit aucune migration).
 */
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "@database/schemas/auth.schema";
import { EVENTS_STATUSES } from "../domain/workflow";

export const events = pgTable("events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id"),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: EVENTS_STATUSES }).default("DRAFT").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [uniqueIndex("events_org_slug_uidx").on(table.organizationId, table.slug)]);

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
