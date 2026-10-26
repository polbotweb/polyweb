/**
 * Lecture du domaine crm (back-office uniquement). SEUL endroit autorisé à LIRE la base
 * pour ce domaine (les écritures passent par `services/`). Chaque lecture est un Effect
 * (`dbTry` → DbError typé), bornée au tenant ; adaptateurs Promise pour les pages Astro.
 */
import { Effect } from "effect";
import { and, asc, desc, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { sales } from "@/modules/sales/schema";
import { sortActivities } from "../domain/activities";
import { crm, crmActivities, crmCompanies, crmContacts } from "../schema";

type Opportunity = typeof crm.$inferSelect;
type Company = typeof crmCompanies.$inferSelect;
type Contact = typeof crmContacts.$inferSelect;
type Activity = typeof crmActivities.$inferSelect;

export type OpportunityDetail = Opportunity & {
  readonly company: Company | null;
  readonly contact: Contact | null;
  readonly quote: { id: string; number: string | null; status: string; grossMinor: number; currency: string } | null;
  readonly activities: readonly Activity[];
};
export type CompanyDetail = Company & { readonly contacts: readonly Contact[]; readonly opportunities: readonly Opportunity[]; readonly activities: readonly Activity[] };
export type ContactDetail = Contact & { readonly company: Company | null; readonly opportunities: readonly Opportunity[]; readonly activities: readonly Activity[] };

const tenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));
const first = <T>(rows: readonly T[]): T | null => rows[0] ?? null;

export const crmLoader = {
  opportunity: (id: string, organizationId: string | null) =>
    Effect.gen(function* () {
      const db = getDrizzle();
      const row = first(yield* dbTry("crm.opportunity", () => db.select().from(crm).where(and(eq(crm.id, id), tenant(crm.organizationId, organizationId))).limit(1)));
      if (!row) return null;
      const [company, contact, quote, activities] = yield* dbTry("crm.opportunity.related", () => Promise.all([
        row.companyId ? db.select().from(crmCompanies).where(eq(crmCompanies.id, row.companyId)).limit(1) : Promise.resolve([]),
        row.contactId ? db.select().from(crmContacts).where(eq(crmContacts.id, row.contactId)).limit(1) : Promise.resolve([]),
        row.quoteId ? db.select({ id: sales.id, number: sales.number, status: sales.status, grossMinor: sales.grossMinor, currency: sales.currency }).from(sales).where(eq(sales.id, row.quoteId)).limit(1) : Promise.resolve([]),
        db.select().from(crmActivities).where(eq(crmActivities.opportunityId, id)),
      ]));
      return { ...row, company: first(company), contact: first(contact), quote: first(quote), activities: sortActivities(activities) } satisfies OpportunityDetail;
    }),

  company: (id: string, organizationId: string | null) =>
    Effect.gen(function* () {
      const db = getDrizzle();
      const row = first(yield* dbTry("crm.company", () => db.select().from(crmCompanies).where(and(eq(crmCompanies.id, id), tenant(crmCompanies.organizationId, organizationId))).limit(1)));
      if (!row) return null;
      const [contacts, opportunities, activities] = yield* dbTry("crm.company.related", () => Promise.all([
        db.select().from(crmContacts).where(eq(crmContacts.companyId, id)).orderBy(asc(crmContacts.lastName)),
        db.select().from(crm).where(eq(crm.companyId, id)).orderBy(desc(crm.createdAt)),
        db.select().from(crmActivities).where(eq(crmActivities.companyId, id)),
      ]));
      return { ...row, contacts, opportunities, activities: sortActivities(activities) } satisfies CompanyDetail;
    }),

  contact: (id: string, organizationId: string | null) =>
    Effect.gen(function* () {
      const db = getDrizzle();
      const row = first(yield* dbTry("crm.contact", () => db.select().from(crmContacts).where(and(eq(crmContacts.id, id), tenant(crmContacts.organizationId, organizationId))).limit(1)));
      if (!row) return null;
      const [company, opportunities, activities] = yield* dbTry("crm.contact.related", () => Promise.all([
        row.companyId ? db.select().from(crmCompanies).where(eq(crmCompanies.id, row.companyId)).limit(1) : Promise.resolve([]),
        db.select().from(crm).where(eq(crm.contactId, id)).orderBy(desc(crm.createdAt)),
        db.select().from(crmActivities).where(eq(crmActivities.contactId, id)),
      ]));
      return { ...row, company: first(company), opportunities, activities: sortActivities(activities) } satisfies ContactDetail;
    }),

  companies: (organizationId: string | null) =>
    dbTry("crm.companies", () => getDrizzle().select().from(crmCompanies).where(tenant(crmCompanies.organizationId, organizationId)).orderBy(asc(crmCompanies.name))),

  contacts: (organizationId: string | null) =>
    dbTry("crm.contacts", () => getDrizzle().select().from(crmContacts).where(tenant(crmContacts.organizationId, organizationId)).orderBy(asc(crmContacts.lastName), asc(crmContacts.firstName))),

  /** Devis du tenant liables à une opportunité. */
  quotes: (organizationId: string | null) =>
    dbTry("crm.quotes", () => getDrizzle().select({ id: sales.id, title: sales.title, number: sales.number, status: sales.status }).from(sales)
      .where(and(eq(sales.kind, "quote"), tenant(sales.organizationId, organizationId))).orderBy(desc(sales.createdAt)).limit(200)),
};

export const loadOpportunity = (id: string, organizationId: string | null) => runOrThrow(crmLoader.opportunity(id, organizationId));
export const loadCompany = (id: string, organizationId: string | null) => runOrThrow(crmLoader.company(id, organizationId));
export const loadContact = (id: string, organizationId: string | null) => runOrThrow(crmLoader.contact(id, organizationId));
export const loadCompanies = (organizationId: string | null) => runOrThrow(crmLoader.companies(organizationId));
export const loadContacts = (organizationId: string | null) => runOrThrow(crmLoader.contacts(organizationId));
export const loadQuoteOptions = (organizationId: string | null) => runOrThrow(crmLoader.quotes(organizationId));
