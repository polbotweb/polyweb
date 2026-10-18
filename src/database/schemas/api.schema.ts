import { pgTable, text, varchar, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { sites } from "./content.schema";

/**
 * Jetons d'API (brique c). Seul le hash SHA-256 du jeton est stocké ; le jeton
 * en clair (`pw_<prefix>_<secret>`) n'est affiché qu'une fois à la création.
 */
export const API_SCOPES = ["content:read", "content:write", "forms:read", "search:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    prefix: varchar("prefix", { length: 16 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    scopes: jsonb("scopes").$type<ApiScope[]>().default([]).notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("api_tokens_hash_uidx").on(t.tokenHash), index("api_tokens_site_idx").on(t.siteId)],
);
