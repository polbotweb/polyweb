import { index, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/**
 * Badges attribués (core/badges, registre typé). Générique : `module` + `scope_id` (ex. site
 * pour les forums) ; l'unicité (module, portée, utilisateur, badge) rend l'attribution idempotente.
 */
export const badgeAwards = pgTable(
  "badge_awards",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    module: varchar("module", { length: 40 }).notNull(),
    scopeId: text("scope_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    badge: varchar("badge", { length: 64 }).notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("badge_awards_unique_uidx").on(t.module, t.scopeId, t.userId, t.badge),
    index("badge_awards_user_idx").on(t.userId, t.module, t.scopeId),
  ],
);
