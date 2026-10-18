import { pgTable, text, varchar, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import type { FieldDefinition } from "@/core/content-types/fields";
import { sites } from "./content.schema";

/** Constructeur de formulaires (brique g). */
export interface FormSettings {
  /** Message affiché après envoi, par locale (repli : fr). */
  successMessage?: Record<string, string>;
  /** Destinataires des notifications e-mail. */
  notifyEmails?: string[];
  /** Conserver les soumissions en base (défaut : oui). */
  storeSubmissions?: boolean;
  /** URL de redirection après envoi (chemin relatif uniquement). */
  redirectPath?: string;
  /** Libellé du bouton d'envoi par locale. */
  submitLabel?: Record<string, string>;
}

export const FORM_STATUSES = ["active", "closed"] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

export const forms = pgTable(
  "forms",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    fields: jsonb("fields").$type<FieldDefinition[]>().default([]).notNull(),
    settings: jsonb("settings").$type<FormSettings>().default({}).notNull(),
    status: varchar("status", { length: 16 }).$type<FormStatus>().default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [uniqueIndex("forms_site_slug_uidx").on(t.siteId, t.slug)],
);

export const FORM_SUBMISSION_STATUSES = ["new", "read", "spam"] as const;
export type FormSubmissionStatus = (typeof FORM_SUBMISSION_STATUSES)[number];

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    locale: varchar("locale", { length: 8 }),
    /** SHA-256 tronqué de l'IP (pas d'IP en clair : RGPD). */
    ipHash: varchar("ip_hash", { length: 32 }),
    userAgent: varchar("user_agent", { length: 300 }),
    status: varchar("status", { length: 16 }).$type<FormSubmissionStatus>().default("new").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("form_submissions_form_idx").on(t.formId, t.createdAt)],
);
