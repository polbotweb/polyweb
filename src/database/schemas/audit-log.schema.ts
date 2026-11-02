import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, index, jsonb, varchar } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resource: text("resource"),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata"),
    /** Portée (C4-A) : sans clé étrangère, le journal survit à la suppression de l'organisation / du site. */
    organizationId: text("organization_id"),
    siteId: text("site_id"),
    module: varchar("module", { length: 64 }),
    /** success | denied | failure */
    outcome: varchar("outcome", { length: 16 }).default("success").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_userId_idx").on(table.userId),
    index("audit_log_action_idx").on(table.action),
    index("audit_log_createdAt_idx").on(table.createdAt),
    index("audit_log_resource_idx").on(table.resource, table.resourceId),
    index("audit_log_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(user, {
    fields: [auditLog.userId],
    references: [user.id],
  }),
}));
