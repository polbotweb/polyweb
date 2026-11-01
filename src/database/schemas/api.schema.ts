import { pgTable, text, varchar, timestamp, jsonb, uniqueIndex, index, integer, primaryKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth.schema";
import { sites } from "./content.schema";

/**
 * Jetons d'API (brique c). Seul le hash SHA-256 du jeton est stocké ; le jeton
 * en clair (`pw_<prefix>_<secret>`) n'est affiché qu'une fois à la création.
 */
/** Scopes du cœur ; les modules en ajoutent via le registre `@/core/api` (`registerApiResource`). */
export const API_SCOPES = ["content:read", "content:write", "forms:read", "search:read"] as const;
/** Scope `<ressource>:read|write` — chaîne, validée à l'exécution contre le registre. */
export type ApiScope = string;

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
    /** Requêtes par minute pour ce jeton (null = défaut `API_RATE_LIMIT_TOKEN`). */
    rateLimitPerMinute: integer("rate_limit_per_minute"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("api_tokens_hash_uidx").on(t.tokenHash),
    index("api_tokens_site_idx").on(t.siteId),
    check("api_tokens_rate_limit_ck", sql`${t.rateLimitPerMinute} is null or ${t.rateLimitPerMinute} between 1 and 100000`),
  ],
);

/** Fenêtres de limitation de débit par jeton (fenêtre fixe d'une minute, partagée entre instances). */
export const apiRateWindows = pgTable(
  "api_rate_windows",
  {
    tokenId: text("token_id").notNull().references(() => apiTokens.id, { onDelete: "cascade" }),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tokenId, t.windowStart] }), index("api_rate_windows_start_idx").on(t.windowStart)],
);

/**
 * Clés d'idempotence des écritures (en-tête `Idempotency-Key`) : la première réponse est rejouée
 * à l'identique pendant 24 h ; même clé + autre requête → 422.
 */
export const apiIdempotencyKeys = pgTable(
  "api_idempotency_keys",
  {
    tokenId: text("token_id").notNull().references(() => apiTokens.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 255 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    /** null tant que la requête est en cours (verrou). */
    status: integer("status"),
    body: jsonb("body"),
    location: text("location"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tokenId, t.key] }), index("api_idempotency_created_idx").on(t.createdAt)],
);
