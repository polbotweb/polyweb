import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { pages } from "./page.schema";
import { user } from "./auth.schema";

// ─── Page Versions ───────────────────────────────────────────────────────────
// Immutable snapshots taken on publish / manual save. Stores full page metadata
// + all sections as JSON so the exact state can be restored.
export const pageVersions = pgTable(
  "page_versions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    /** Full snapshot: { page: {...fields}, sections: [...] } */
    snapshot: jsonb("snapshot").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("page_versions_pageId_versionNumber_uidx").on(
      table.pageId,
      table.versionNumber,
    ),
    index("page_versions_pageId_idx").on(table.pageId),
    index("page_versions_createdAt_idx").on(table.createdAt),
  ],
);

// ─── Relations ───────────────────────────────────────────────────────────────

export const pageVersionsRelations = relations(pageVersions, ({ one }) => ({
  page: one(pages, {
    fields: [pageVersions.pageId],
    references: [pages.id],
  }),
  author: one(user, {
    fields: [pageVersions.createdBy],
    references: [user.id],
  }),
}));
