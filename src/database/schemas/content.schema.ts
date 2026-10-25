import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.schema";
import type { FieldDefinition } from "@/core/content-types/fields";
import type { BlocksDocument } from "@/core/blocks/registry";

/**
 * Plateforme CMS : sites (brique j), types de contenu dynamiques (brique b),
 * entrées traduites (pattern *_translations de concordia/atomic), révisions (brique f).
 */

export const DEFAULT_SITE_ID = "00000000-0000-4000-8000-000000000001";

export const sites = pgTable(
  "sites",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    /** Noms d'hôte servis par ce site (sans port), ex. ["example.com","www.example.com"]. */
    domains: jsonb("domains").$type<string[]>().default([]).notNull(),
    defaultLocale: varchar("default_locale", { length: 8 }).default("fr").notNull(),
    locales: jsonb("locales").$type<string[]>().default(["fr", "en", "es", "ar"]).notNull(),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    isDefault: boolean("is_default").default(false).notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    uniqueIndex("sites_slug_uidx").on(t.slug),
    uniqueIndex("sites_single_default_uidx").on(t.isDefault).where(sql`${t.isDefault} = true`),
  ],
);

export interface ContentTypeSettings {
  /** Champ "blocs" (éditeur TipTap) disponible sur les entrées. */
  hasBlocks?: boolean;
  /** Lecture anonyme des entrées publiées via l'API publique et les pages /c/. */
  publicRead?: boolean;
  /** Type "singleton" (une seule entrée, ex. page d'accueil). */
  singleton?: boolean;
  icon?: string;
}

export const contentTypes = pgTable(
  "content_types",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    fields: jsonb("fields").$type<FieldDefinition[]>().default([]).notNull(),
    settings: jsonb("settings").$type<ContentTypeSettings>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [uniqueIndex("content_types_site_slug_uidx").on(t.siteId, t.slug)],
);

export const CONTENT_STATUSES = ["draft", "published", "archived"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const contentEntries = pgTable(
  "content_entries",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    typeId: text("type_id").notNull().references(() => contentTypes.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 200 }).notNull(),
    status: text("status", { enum: CONTENT_STATUSES }).default("draft").notNull(),
    /** Valeurs des champs non traduits. */
    sharedData: jsonb("shared_data").$type<Record<string, unknown>>().default({}).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    uniqueIndex("content_entries_type_slug_uidx").on(t.typeId, t.slug),
    index("content_entries_site_status_idx").on(t.siteId, t.status),
  ],
);

export interface EntrySeo { metaTitle?: string; metaDescription?: string; ogImage?: string; noindex?: boolean }

export const contentEntryTranslations = pgTable(
  "content_entry_translations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    entryId: text("entry_id").notNull().references(() => contentEntries.id, { onDelete: "cascade" }),
    locale: varchar("locale", { length: 8 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
    blocks: jsonb("blocks").$type<BlocksDocument>(),
    seo: jsonb("seo").$type<EntrySeo>().default({}).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [uniqueIndex("content_entry_translations_entry_locale_uidx").on(t.entryId, t.locale)],
);

export interface EntrySnapshot {
  slug: string;
  status: ContentStatus;
  sharedData: Record<string, unknown>;
  translations: Array<{ locale: string; title: string; data: Record<string, unknown>; blocks: BlocksDocument | null; seo: EntrySeo }>;
}

export const contentEntryRevisions = pgTable(
  "content_entry_revisions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    entryId: text("entry_id").notNull().references(() => contentEntries.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").$type<EntrySnapshot>().notNull(),
    message: varchar("message", { length: 300 }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("content_entry_revisions_entry_version_uidx").on(t.entryId, t.version)],
);
