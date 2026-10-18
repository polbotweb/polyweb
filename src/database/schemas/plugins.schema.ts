import { pgTable, text, varchar, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/**
 * État des plugins (brique i). Les plugins sont du code installé dans
 * `src/plugins/` (pas de chargement dynamique de code distant) ; cette table
 * ne stocke que l'activation et les réglages validés de chacun.
 */
export const pluginStates = pgTable("plugin_states", {
  pluginId: varchar("plugin_id", { length: 64 }).primaryKey(),
  enabled: boolean("enabled").default(false).notNull(),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
  lastError: text("last_error"),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
