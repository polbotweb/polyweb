import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.schema";

/**
 * Vues enregistrées des listes admin (core/filters) : une requête d'URL CANONIQUE
 * (parse → serialize de la définition de liste) par utilisateur, ressource et tenant.
 * Propriété stricte : seul son auteur la lit, la renomme ou la supprime.
 */
export const adminSavedViews = pgTable("admin_saved_views", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  resource: text("resource").notNull(),
  name: text("name").notNull(),
  query: text("query").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  // NULLS NOT DISTINCT (PG ≥ 15) : un seul nom par vue aussi hors organisation.
  unique("admin_saved_views_owner_name_uq").on(table.userId, table.resource, table.organizationId, table.name).nullsNotDistinct(),
  index("admin_saved_views_owner_idx").on(table.userId, table.resource),
]);
