/**
 * Tables du domaine bookings : ressources réservables (salle, personne, équipement) avec fuseau
 * IANA et plages d'ouverture hebdomadaires (core/scheduling), réservations sur des intervalles
 * UTC semi-ouverts [starts_at, ends_at), révisions et verrous d'édition. Multi-tenant
 * (`organizationId`, null = plateforme). Le non-chevauchement est garanti par le service, sous
 * verrou transactionnel de la ressource (pas d'extension btree_gist).
 *
 * Exportées depuis `src/database/schemas.ts` ; migration produite par `pnpm db:generate`.
 */
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user } from "@database/schemas/auth.schema";
import type { WeeklyWindow } from "@/core/scheduling";
import { RESOURCE_KINDS } from "../domain/resource";
import { BOOKING_STATUSES } from "../domain/workflow";

export const bookingsResources = pgTable("bookings_resources", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  kind: text("kind", { enum: RESOURCE_KINDS }).default("room").notNull(),
  capacity: integer("capacity").default(1).notNull(),
  timezone: text("timezone").default("UTC").notNull(),
  slotMinutes: integer("slot_minutes").default(30).notNull(),
  windows: jsonb("windows").$type<WeeklyWindow[]>().default([]).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("bookings_resources_org_code_uidx").on(table.organizationId, table.code),
  check("bookings_resources_capacity_positive", sql`${table.capacity} > 0`),
]);

/** Réservations : entité principale du module (`bookings`, alias attendu par le socle). */
export const bookings = pgTable("bookings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  /** Numéro de réservation, attribué à la confirmation (core/numbering). */
  number: text("number"),
  status: text("status", { enum: BOOKING_STATUSES }).default("REQUESTED").notNull(),
  resourceId: text("resource_id").notNull().references(() => bookingsResources.id, { onDelete: "no action" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  partySize: integer("party_size").default(1).notNull(),
  notes: text("notes"),
  confirmedAt: timestamp("confirmed_at"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("bookings_org_slug_uidx").on(table.organizationId, table.slug),
  uniqueIndex("bookings_org_number_uidx").on(table.organizationId, table.number),
  index("bookings_org_status_idx").on(table.organizationId, table.status),
  index("bookings_resource_starts_idx").on(table.resourceId, table.startsAt),
  check("bookings_interval_valid", sql`${table.endsAt} > ${table.startsAt}`),
  check("bookings_party_size_positive", sql`${table.partySize} > 0`),
]);

/** Révisions (core/revision) : une ligne par écriture de réservation. */
export const bookingsRevisions = pgTable("bookings_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: BOOKING_STATUSES }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("bookings_revisions_resource_idx").on(table.resourceId)]);

/** Verrous d'édition (core/locks) : une ligne par réservation. */
export const bookingsLocks = pgTable("bookings_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => bookings.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});
