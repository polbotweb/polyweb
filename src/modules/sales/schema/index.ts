/**
 * Tables du domaine sales : documents de vente (devis, factures, avoirs) avec totaux figés à
 * l'émission, lignes, encaissements, historique des relances, révisions et verrous d'édition.
 * Montants en unités mineures (`bigint` mode number, core/money) ; quantités et taux en `numeric`
 * (chaînes décimales exactes). Numéro définitif attribué par core/numbering (sans trou par tenant).
 *
 * À exporter depuis `src/database/schemas.ts` puis `pnpm db:generate`
 * pour produire la migration (le générateur n'écrit aucune migration).
 */
import { type AnyPgColumn, bigint, boolean, date, index, integer, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user } from "@database/schemas/auth.schema";
import { CUSTOMER_TYPES, SUPPLY_TYPES, TAX_CATEGORIES } from "@/modules/tax/domain/rules";
import { SALES_DOCUMENT_KINDS, SALES_STATUSES } from "../domain/workflow";
import { PAYMENT_METHODS } from "../domain/payments";

export const sales = pgTable("sales_documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: SALES_DOCUMENT_KINDS }).notNull(),
  /** Référence interne stable (URL d'admin) ; le numéro légal est `number`. */
  slug: text("slug").notNull(),
  /** Objet du document. */
  title: text("title").notNull(),
  status: text("status", { enum: SALES_STATUSES }).default("DRAFT").notNull(),
  /** Numéro définitif (null tant que brouillon). */
  number: text("number"),
  /** Devis d'origine (facture) ou facture créditée (avoir). */
  sourceDocumentId: text("source_document_id").references((): AnyPgColumn => sales.id, { onDelete: "restrict" }),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerAddress: text("customer_address"),
  customerCountry: text("customer_country").notNull(),
  customerType: text("customer_type", { enum: CUSTOMER_TYPES }).default("B2B").notNull(),
  customerVatNumber: text("customer_vat_number"),
  sellerCountry: text("seller_country").notNull(),
  supplyType: text("supply_type", { enum: SUPPLY_TYPES }).default("services").notNull(),
  ossRegistered: boolean("oss_registered").default(false).notNull(),
  currency: text("currency").default("EUR").notNull(),
  issueDate: date("issue_date", { mode: "string" }),
  dueDate: date("due_date", { mode: "string" }),
  /** Devis : date limite de validité. */
  validUntil: date("valid_until", { mode: "string" }),
  paymentTermDays: integer("payment_term_days").default(30).notNull(),
  netMinor: bigint("net_minor", { mode: "number" }).default(0).notNull(),
  taxMinor: bigint("tax_minor", { mode: "number" }).default(0).notNull(),
  grossMinor: bigint("gross_minor", { mode: "number" }).default(0).notNull(),
  paidMinor: bigint("paid_minor", { mode: "number" }).default(0).notNull(),
  creditedMinor: bigint("credited_minor", { mode: "number" }).default(0).notNull(),
  /** Mention légale de TVA (autoliquidation, exonération…), clé i18n. */
  taxMention: text("tax_mention"),
  reminderLevel: integer("reminder_level").default(0).notNull(),
  notes: text("notes"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("sales_documents_org_slug_uidx").on(table.organizationId, table.slug),
  // Numéro unique par tenant et type (plateforme incluse : coalesce), brouillons non numérotés exclus.
  uniqueIndex("sales_documents_org_kind_number_uidx").on(sql`coalesce(${table.organizationId}, '')`, table.kind, table.number).where(sql`${table.number} is not null`),
  index("sales_documents_org_kind_status_idx").on(table.organizationId, table.kind, table.status),
  index("sales_documents_source_idx").on(table.sourceDocumentId),
]);

export const salesDocumentLines = pgTable("sales_document_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  documentId: text("document_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 13, scale: 4 }).notNull(),
  unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
  discountPercent: numeric("discount_percent", { precision: 7, scale: 4 }).default("0").notNull(),
  taxCategory: text("tax_category", { enum: TAX_CATEGORIES }).default("standard").notNull(),
  ratePercent: numeric("rate_percent", { precision: 7, scale: 4 }).default("0").notNull(),
  netMinor: bigint("net_minor", { mode: "number" }).default(0).notNull(),
}, (table) => [uniqueIndex("sales_document_lines_doc_pos_uidx").on(table.documentId, table.position)]);

export const salesPayments = pgTable("sales_payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  documentId: text("document_id").notNull().references(() => sales.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  method: text("method", { enum: PAYMENT_METHODS }).default("bank_transfer").notNull(),
  paidAt: date("paid_at", { mode: "string" }).notNull(),
  reference: text("reference"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("sales_payments_document_idx").on(table.documentId)]);

export const salesReminders = pgTable("sales_reminders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  documentId: text("document_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  level: integer("level").notNull(),
  daysOverdue: integer("days_overdue").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  sentBy: text("sent_by").references(() => user.id, { onDelete: "set null" }),
}, (table) => [uniqueIndex("sales_reminders_doc_level_uidx").on(table.documentId, table.level)]);

/** Révisions (core/revision) : une ligne par écriture, pour l'historique et la restauration. */
export const salesDocumentRevisions = pgTable("sales_document_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: SALES_STATUSES }).notNull(),
  number: text("number"),
  grossMinor: bigint("gross_minor", { mode: "number" }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("sales_document_revisions_resource_idx").on(table.resourceId)]);

/** Verrous d'édition (core/locks) : une ligne par ressource, propriétaire utilisateur + session. */
export const salesDocumentLocks = pgTable("sales_document_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => sales.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});
