import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
  index,
  check,
  jsonb,
} from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

// ─── Pages ───────────────────────────────────────────────────────────────────
// CMS pages. One row per page × locale. Unique on (locale, slug).
export const pages = pgTable(
  "pages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    locale: text("locale").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    ogImage: text("og_image"),
    canonical: text("canonical"),
    robots: text("robots"),
    template: text("template").default("default").notNull(),
    isPublished: boolean("is_published").default(false).notNull(),
    publishedAt: timestamp("published_at"),
    scheduledAt: timestamp("scheduled_at"),
    scheduledUnpublishAt: timestamp("scheduled_unpublish_at"),
    sortOrder: integer("sort_order").default(0).notNull(),
    deletedAt: timestamp("deleted_at"),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    lockedBy: text("locked_by").references(() => user.id, { onDelete: "set null" }),
    lockedAt: timestamp("locked_at"),
    // search_vector tsvector column exists in DB but is excluded from Drizzle schema
    // — managed entirely by DB triggers (migration 0018), queried via raw SQL in /api/search
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("pages_locale_slug_uidx").on(table.locale, table.slug),
    index("pages_locale_idx").on(table.locale),
    index("pages_locale_published_idx").on(table.locale, table.isPublished, table.sortOrder),
    index("pages_deletedAt_idx").on(table.deletedAt),
    index("pages_scheduledAt_idx").on(table.scheduledAt),
    index("pages_scheduledUnpublishAt_idx").on(table.scheduledUnpublishAt),
    check("pages_publish_consistency", sql`NOT ${table.isPublished} OR ${table.publishedAt} IS NOT NULL`),
  ],
);

// ─── Page Sections ───────────────────────────────────────────────────────────
// Flexible content blocks with typed JSON. Ordered per page.
export const pageSections = pgTable(
  "page_sections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    content: jsonb("content").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isVisible: boolean("is_visible").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("page_sections_pageId_idx").on(table.pageId),
    index("page_sections_pageId_visible_sort_idx").on(table.pageId, table.isVisible, table.sortOrder),
  ],
);

// ─── Relations ───────────────────────────────────────────────────────────────

export const pagesRelations = relations(pages, ({ many }) => ({
  sections: many(pageSections),
}));

export const pageSectionsRelations = relations(pageSections, ({ one }) => ({
  page: one(pages, {
    fields: [pageSections.pageId],
    references: [pages.id],
  }),
}));
