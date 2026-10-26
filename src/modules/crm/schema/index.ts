/**
 * Tables du domaine crm : sociétés, contacts, opportunités (pipeline), activités, révisions et
 * verrous d'édition des opportunités. Multi-tenant (`organizationId`, null = plateforme) ;
 * montants en unités mineures (`bigint` mode number, core/money).
 *
 * Exportées depuis `src/database/schemas.ts` ; migration produite par `pnpm db:generate`.
 */
import { bigint, index, integer, pgTable, text, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "@database/schemas/auth.schema";
import { sales } from "@/modules/sales/schema";
import { CRM_STAGES, LOST_REASONS } from "../domain/workflow";
import { ACTIVITY_KINDS } from "../domain/activities";

export const crmCompanies = pgTable("crm_companies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  country: text("country"),
  vatNumber: text("vat_number"),
  address: text("address"),
  notes: text("notes"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [index("crm_companies_org_name_idx").on(table.organizationId, table.name)]);

export const crmContacts = pgTable("crm_contacts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  companyId: text("company_id").references(() => crmCompanies.id, { onDelete: "set null" }),
  firstName: text("first_name"),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  jobTitle: text("job_title"),
  /** Clé de dédoublonnage (domain/contacts) : unique par tenant. */
  dedupKey: text("dedup_key").notNull(),
  notes: text("notes"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("crm_contacts_org_dedup_uidx").on(table.organizationId, table.dedupKey),
  index("crm_contacts_company_idx").on(table.companyId),
]);

/** Opportunités : entité principale du module (`crm`, alias attendu par le socle). */
export const crm = pgTable("crm_opportunities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: CRM_STAGES }).default("NEW").notNull(),
  companyId: text("company_id").references(() => crmCompanies.id, { onDelete: "set null" }),
  contactId: text("contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
  ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
  amountMinor: bigint("amount_minor", { mode: "number" }).default(0).notNull(),
  currency: text("currency").default("EUR").notNull(),
  /** Probabilité saisie (0–100) ; null → défaut de l'étape. */
  probability: integer("probability"),
  expectedCloseDate: date("expected_close_date", { mode: "string" }),
  lostReason: text("lost_reason", { enum: LOST_REASONS }),
  closedAt: timestamp("closed_at"),
  /** Devis créé depuis l'opportunité (module ventes). */
  quoteId: text("quote_id").references(() => sales.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("crm_opportunities_org_slug_uidx").on(table.organizationId, table.slug),
  index("crm_opportunities_org_status_idx").on(table.organizationId, table.status),
  index("crm_opportunities_company_idx").on(table.companyId),
  index("crm_opportunities_contact_idx").on(table.contactId),
]);
export const crmOpportunities = crm;

export const crmActivities = pgTable("crm_activities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ACTIVITY_KINDS }).notNull(),
  subject: text("subject").notNull(),
  body: text("body"),
  opportunityId: text("opportunity_id").references(() => crm.id, { onDelete: "cascade" }),
  contactId: text("contact_id").references(() => crmContacts.id, { onDelete: "cascade" }),
  companyId: text("company_id").references(() => crmCompanies.id, { onDelete: "cascade" }),
  dueAt: timestamp("due_at"),
  doneAt: timestamp("done_at"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("crm_activities_opportunity_idx").on(table.opportunityId),
  index("crm_activities_contact_idx").on(table.contactId),
  index("crm_activities_company_idx").on(table.companyId),
  index("crm_activities_org_due_idx").on(table.organizationId, table.dueAt),
]);

/** Révisions (core/revision) : une ligne par écriture d'opportunité. */
export const crmOpportunityRevisions = pgTable("crm_opportunity_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => crm.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: CRM_STAGES }).notNull(),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("crm_opportunity_revisions_resource_idx").on(table.resourceId)]);

/** Verrous d'édition (core/locks) : une ligne par opportunité, propriétaire utilisateur + session. */
export const crmOpportunityLocks = pgTable("crm_opportunity_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => crm.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});
