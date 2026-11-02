import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.schema";
import { sites } from "./content.schema";

/**
 * Accès par site (C3-A) : un membre qui possède au moins une ligne dans une organisation
 * n'y agit QUE sur les sites listés ; `role` (facultatif) remplace son rôle d'organisation
 * pour ce site. Sans ligne : accès à toute l'organisation (rétrocompatible). Le propriétaire
 * de l'organisation n'est jamais restreint.
 */
export const siteAccess = pgTable(
  "site_access",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("site_access_site_user_uidx").on(t.siteId, t.userId),
    index("site_access_org_user_idx").on(t.organizationId, t.userId),
  ],
);

export const siteAccessRelations = relations(siteAccess, ({ one }) => ({
  organization: one(organization, { fields: [siteAccess.organizationId], references: [organization.id] }),
  site: one(sites, { fields: [siteAccess.siteId], references: [sites.id] }),
  user: one(user, { fields: [siteAccess.userId], references: [user.id] }),
}));
