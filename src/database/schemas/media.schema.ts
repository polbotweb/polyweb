import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { organization } from "./auth.schema";

// ─── Media Folders ───────────────────────────────────────────────────────────
// Hierarchical folder structure for organising uploaded media.
export const mediaFolders = pgTable(
  "media_folders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("media_folders_parentId_idx").on(table.parentId),
    uniqueIndex("media_folders_org_parent_name_uidx").on(table.organizationId, table.parentId, table.name),
    index("media_folders_organizationId_idx").on(table.organizationId),
  ],
);

// Self-referencing FK must be declared separately to avoid circular reference at definition time.
// Drizzle handles this via the relations API below.

// ─── Media Files ─────────────────────────────────────────────────────────────
// One row per uploaded file. Stored on disk under public/uploads/media/.
export const mediaFiles = pgTable(
  "media_files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    folderId: text("folder_id").references(() => mediaFolders.id, {
      onDelete: "set null",
    }),
    filename: text("filename").notNull(),
    url: text("url").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("media_files_folderId_idx").on(table.folderId),
    index("media_files_organizationId_idx").on(table.organizationId),
    uniqueIndex("media_files_url_uidx").on(table.url),
    check("media_files_size_positive", sql`${table.size} > 0`),
  ],
);

// ─── Media File Alts (i18n) ──────────────────────────────────────────────────
// Localised alt text and title per file. One row per file × locale.
export const mediaFileAlts = pgTable(
  "media_file_alts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    fileId: text("file_id")
      .notNull()
      .references(() => mediaFiles.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    alt: text("alt").notNull(),
    title: text("title"),
  },
  (table) => [
    uniqueIndex("media_file_alts_fileId_locale_uidx").on(table.fileId, table.locale),
    index("media_file_alts_fileId_idx").on(table.fileId),
  ],
);

// ─── Relations ───────────────────────────────────────────────────────────────

export const mediaFoldersRelations = relations(mediaFolders, ({ one, many }) => ({
  organization: one(organization, {
    fields: [mediaFolders.organizationId],
    references: [organization.id],
  }),
  parent: one(mediaFolders, {
    fields: [mediaFolders.parentId],
    references: [mediaFolders.id],
    relationName: "folder_parent",
  }),
  children: many(mediaFolders, { relationName: "folder_parent" }),
  files: many(mediaFiles),
}));

export const mediaFilesRelations = relations(mediaFiles, ({ one, many }) => ({
  organization: one(organization, {
    fields: [mediaFiles.organizationId],
    references: [organization.id],
  }),
  folder: one(mediaFolders, {
    fields: [mediaFiles.folderId],
    references: [mediaFolders.id],
  }),
  alts: many(mediaFileAlts),
}));

export const mediaFileAltsRelations = relations(mediaFileAlts, ({ one }) => ({
  file: one(mediaFiles, {
    fields: [mediaFileAlts.fileId],
    references: [mediaFiles.id],
  }),
}));
