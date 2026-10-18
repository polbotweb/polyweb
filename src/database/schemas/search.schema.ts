import { pgTable, text, varchar, timestamp, index, customType } from "drizzle-orm/pg-core";
import { sites } from "./content.schema";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/**
 * Index de recherche unifié (brique k, pilote `postgres`). Une ligne par
 * document et par langue : entrées de contenu, articles, services, pages.
 * `tsv` est calculé à l'écriture avec la configuration de la langue
 * (french/english/spanish/simple), titre pondéré A, résumé B, corps C.
 */
export const searchDocuments = pgTable(
  "search_documents",
  {
    id: varchar("id", { length: 200 }).primaryKey(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    type: varchar("type", { length: 64 }),
    entityId: text("entity_id").notNull(),
    locale: varchar("locale", { length: 8 }).notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    body: text("body").default("").notNull(),
    url: text("url").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    tsv: tsvector("tsv"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("search_documents_tsv_gin_idx").using("gin", t.tsv),
    index("search_documents_site_locale_idx").on(t.siteId, t.locale),
    index("search_documents_entity_idx").on(t.kind, t.entityId),
  ],
);
