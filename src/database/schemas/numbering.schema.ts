import { integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { organization } from "./auth.schema";

/**
 * Séquences de numérotation des documents (core/numbering) : un compteur par tenant,
 * type de document (`key`, ex. « invoice ») et période (`""` sans remise à zéro,
 * `2026`, `2026-10`). `lastValue` = dernier numéro attribué (sans trou : incrément
 * dans la transaction qui crée le document).
 */
export const documentSequences = pgTable("document_sequences", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  period: text("period").default("").notNull(),
  lastValue: integer("last_value").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  // NULLS NOT DISTINCT (PG ≥ 15) : une seule séquence plateforme par clé et période.
  unique("document_sequences_scope_uq").on(table.organizationId, table.key, table.period).nullsNotDistinct(),
]);
