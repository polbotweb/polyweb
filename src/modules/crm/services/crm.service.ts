/**
 * Service Effect du domaine crm : sociétés, contacts (dédoublonnés par tenant), opportunités
 * (pipeline core/workflow, raison de perte, clôture datée, devis lié du module ventes) et
 * activités. Accès base via `dbTry` / `dbTransaction`, verrou d'édition des opportunités via
 * core/locks, révision à chaque écriture d'opportunité. Les erreurs de domaine deviennent
 * BAD_REQUEST ; une référence d'un autre tenant est refusée (NOT_FOUND, sans fuite).
 */
import { Effect } from "effect";
import { and, eq, isNull, ne, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/action";
import { canTransition } from "@/core/workflow";
import type { LockOwner } from "@/core/locks/policy";
import { sales } from "@/modules/sales/schema";
import { crm, crmActivities, crmCompanies, crmContacts, crmOpportunityRevisions } from "../schema";
import { crmLock } from "../locks";
import { crmWorkflow, isOpenStage, type CrmStage } from "../domain/workflow";
import { validateLostReason, validateOpportunityFigures } from "../domain/opportunity";
import { contactDedupKey, normalizeCountry, normalizeEmail, normalizePhone, normalizeWebsite, requireName } from "../domain/contacts";
import { validateActivity } from "../domain/activities";
import type { InvalidActivityError, InvalidContactError, InvalidOpportunityError } from "../domain/errors";

export type OpportunityRow = typeof crm.$inferSelect;
export type CompanyRow = typeof crmCompanies.$inferSelect;
export type ContactRow = typeof crmContacts.$inferSelect;
export type ActivityRow = typeof crmActivities.$inferSelect;
type Executor = ReturnType<typeof getDrizzle> | DbTransaction;

type DomainError = InvalidOpportunityError | InvalidContactError | InvalidActivityError;
/** Erreur de domaine → BAD_REQUEST (message lisible conservé). */
const domain = <A>(effect: Effect.Effect<A, DomainError>) => Effect.catch(effect, (error: DomainError) => fail("BAD_REQUEST", error.message));

const sameTenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));

/** Vérifie qu'une référence (société, contact, devis) existe DANS le même tenant. */
const ensureRef = (executor: Executor, table: typeof crmCompanies | typeof crmContacts | typeof sales, id: string | null | undefined, organizationId: string | null, label: string) =>
  id
    ? dbTry(`crm.ref.${label}`, () => executor.select({ id: table.id }).from(table).where(and(eq(table.id, id), sameTenant(table.organizationId, organizationId))).limit(1)).pipe(
      Effect.flatMap((rows) => (rows[0] ? Effect.succeed(id) : fail("NOT_FOUND", `${label} introuvable.`))),
    )
    : Effect.succeed(null);

const findOpportunity = (executor: Executor, id: string, forUpdate = false) =>
  dbTry("crm.findById", () => {
    const query = executor.select().from(crm).where(eq(crm.id, id)).limit(1);
    return forUpdate ? query.for("update") : query;
  }).pipe(Effect.flatMap((rows) => (rows[0] ? Effect.succeed(rows[0]) : fail("NOT_FOUND", "Opportunité introuvable."))));

const revision = (executor: Executor, row: OpportunityRow, authorId: string, note: string) =>
  dbTry("crm.revision", () => executor.insert(crmOpportunityRevisions).values({ resourceId: row.id, authorId, title: row.title, slug: row.slug, status: row.status, amountMinor: row.amountMinor, note }));

const slugify = (title: string) =>
  title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "opportunite";

export interface CompanyInput {
  readonly name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly website?: string | null;
  readonly country?: string | null;
  readonly vatNumber?: string | null;
  readonly address?: string | null;
  readonly notes?: string | null;
}

const companyColumns = (input: CompanyInput) =>
  domain(Effect.gen(function* () {
    return {
      name: yield* requireName(input.name),
      email: yield* normalizeEmail(input.email),
      phone: yield* normalizePhone(input.phone),
      website: yield* normalizeWebsite(input.website),
      country: yield* normalizeCountry(input.country),
      vatNumber: input.vatNumber?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
    };
  }));

export interface ContactInput {
  readonly firstName?: string | null;
  readonly lastName: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly jobTitle?: string | null;
  readonly companyId?: string | null;
  readonly notes?: string | null;
}

const contactColumns = (executor: Executor, input: ContactInput, organizationId: string | null) =>
  Effect.gen(function* () {
    const fields = yield* domain(Effect.gen(function* () {
      const lastName = yield* requireName(input.lastName);
      const firstName = input.firstName?.trim() || null;
      const email = yield* normalizeEmail(input.email);
      return { firstName, lastName, email, phone: yield* normalizePhone(input.phone), dedupKey: contactDedupKey({ email, firstName, lastName }) };
    }));
    const companyId = yield* ensureRef(executor, crmCompanies, input.companyId, organizationId, "Société");
    return { ...fields, companyId, jobTitle: input.jobTitle?.trim() || null, notes: input.notes?.trim() || null };
  });

const ensureUniqueContact = (executor: Executor, dedupKey: string, organizationId: string | null, exceptId?: string) =>
  dbTry("crm.contact.dedup", () =>
    executor.select({ id: crmContacts.id }).from(crmContacts)
      .where(and(eq(crmContacts.dedupKey, dedupKey), sameTenant(crmContacts.organizationId, organizationId), exceptId ? ne(crmContacts.id, exceptId) : undefined)).limit(1),
  ).pipe(Effect.flatMap((rows) => (rows[0] ? fail("CONFLICT", "Un contact identique existe déjà.") : Effect.void)));

export interface OpportunityInput {
  readonly title: string;
  readonly companyId?: string | null;
  readonly contactId?: string | null;
  readonly ownerId?: string | null;
  readonly amountMinor: number;
  readonly currency: string;
  readonly probability?: number | null;
  readonly expectedCloseDate?: string | null;
  readonly notes?: string | null;
}

const opportunityColumns = (executor: Executor, input: OpportunityInput, organizationId: string | null) =>
  Effect.gen(function* () {
    const figures = yield* domain(validateOpportunityFigures({ amountMinor: input.amountMinor, currency: input.currency, probability: input.probability ?? null }));
    const companyId = yield* ensureRef(executor, crmCompanies, input.companyId, organizationId, "Société");
    const contactId = yield* ensureRef(executor, crmContacts, input.contactId, organizationId, "Contact");
    return {
      title: input.title.trim(),
      companyId,
      contactId,
      ownerId: input.ownerId ?? null,
      amountMinor: figures.amountMinor,
      currency: figures.currency,
      probability: figures.probability,
      expectedCloseDate: input.expectedCloseDate ?? null,
      notes: input.notes?.trim() || null,
    };
  });

export interface ActivityInput {
  readonly kind: string;
  readonly subject: string;
  readonly body?: string | null;
  readonly dueAt?: Date | null;
  readonly opportunityId?: string | null;
  readonly contactId?: string | null;
  readonly companyId?: string | null;
}

export const crmService = {
  // ── Sociétés ────────────────────────────────────────────────────────────
  createCompany: (input: CompanyInput & { readonly organizationId: string | null }, authorId: string) =>
    Effect.gen(function* () {
      const columns = yield* companyColumns(input);
      const [row] = yield* dbTry("crm.company.create", () => getDrizzle().insert(crmCompanies).values({ ...columns, organizationId: input.organizationId, createdBy: authorId }).returning());
      return row!;
    }),

  updateCompany: (id: string, input: CompanyInput) =>
    Effect.gen(function* () {
      const columns = yield* companyColumns(input);
      const [row] = yield* dbTry("crm.company.update", () => getDrizzle().update(crmCompanies).set(columns).where(eq(crmCompanies.id, id)).returning());
      return row ?? (yield* fail("NOT_FOUND", "Société introuvable."));
    }),

  deleteCompany: (id: string) =>
    dbTry("crm.company.delete", () => getDrizzle().delete(crmCompanies).where(eq(crmCompanies.id, id)).returning({ id: crmCompanies.id })).pipe(
      Effect.flatMap((rows) => (rows[0] ? Effect.succeed({ id }) : fail("NOT_FOUND", "Société introuvable."))),
    ),

  // ── Contacts ────────────────────────────────────────────────────────────
  createContact: (input: ContactInput & { readonly organizationId: string | null }, authorId: string) =>
    dbTransaction("crm.contact.create", (tx) =>
      Effect.gen(function* () {
        const columns = yield* contactColumns(tx, input, input.organizationId);
        yield* ensureUniqueContact(tx, columns.dedupKey, input.organizationId);
        const [row] = yield* dbTry("crm.contact.create", () => tx.insert(crmContacts).values({ ...columns, organizationId: input.organizationId, createdBy: authorId }).returning());
        return row!;
      })),

  updateContact: (id: string, input: ContactInput) =>
    dbTransaction("crm.contact.update", (tx) =>
      Effect.gen(function* () {
        const [current] = yield* dbTry("crm.contact.find", () => tx.select().from(crmContacts).where(eq(crmContacts.id, id)).limit(1).for("update"));
        if (!current) return yield* fail("NOT_FOUND", "Contact introuvable.");
        const columns = yield* contactColumns(tx, input, current.organizationId);
        yield* ensureUniqueContact(tx, columns.dedupKey, current.organizationId, id);
        const [row] = yield* dbTry("crm.contact.update", () => tx.update(crmContacts).set(columns).where(eq(crmContacts.id, id)).returning());
        return row!;
      })),

  deleteContact: (id: string) =>
    dbTry("crm.contact.delete", () => getDrizzle().delete(crmContacts).where(eq(crmContacts.id, id)).returning({ id: crmContacts.id })).pipe(
      Effect.flatMap((rows) => (rows[0] ? Effect.succeed({ id }) : fail("NOT_FOUND", "Contact introuvable."))),
    ),

  // ── Opportunités ────────────────────────────────────────────────────────
  createOpportunity: (input: OpportunityInput & { readonly organizationId: string | null }, authorId: string) =>
    dbTransaction("crm.opportunity.create", (tx) =>
      Effect.gen(function* () {
        const columns = yield* opportunityColumns(tx, input, input.organizationId);
        const slug = `${slugify(columns.title)}-${crypto.randomUUID().slice(0, 8)}`;
        const [row] = yield* dbTry("crm.opportunity.create", () => tx.insert(crm).values({ ...columns, slug, organizationId: input.organizationId, ownerId: columns.ownerId ?? authorId, createdBy: authorId }).returning());
        yield* revision(tx, row!, authorId, "Création");
        return row!;
      })),

  updateOpportunity: (id: string, input: OpportunityInput, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* crmLock.ensureNotLockedByOther(id, owner, locale);
      return yield* dbTransaction("crm.opportunity.update", (tx) =>
        Effect.gen(function* () {
          const current = yield* findOpportunity(tx, id, true);
          if (!isOpenStage(current.status)) return yield* fail("BAD_REQUEST", "Opportunité close : rouvrir avant de modifier.");
          const columns = yield* opportunityColumns(tx, input, current.organizationId);
          const [row] = yield* dbTry("crm.opportunity.update", () => tx.update(crm).set(columns).where(eq(crm.id, id)).returning());
          yield* revision(tx, row!, owner.userId, "Mise à jour");
          return row!;
        }));
    }),

  /** Changement d'étape : table de transitions, raison obligatoire pour LOST, date de clôture. */
  transition: (id: string, to: CrmStage, owner: LockOwner, options: { readonly lostReason?: string | null; readonly locale?: string } = {}) =>
    Effect.gen(function* () {
      yield* crmLock.ensureNotLockedByOther(id, owner, options.locale);
      const lostReason = yield* domain(validateLostReason(to, options.lostReason));
      return yield* dbTransaction("crm.transition", (tx) =>
        Effect.gen(function* () {
          const current = yield* findOpportunity(tx, id, true);
          if (!canTransition(crmWorkflow, current.status, to)) return yield* fail("BAD_REQUEST", `Transition d'étape invalide : ${current.status} → ${to}.`);
          const closing = !isOpenStage(to);
          const [row] = yield* dbTry("crm.transition", () =>
            tx.update(crm).set({ status: to, lostReason, closedAt: closing ? new Date() : null }).where(eq(crm.id, id)).returning());
          yield* revision(tx, row!, owner.userId, `Étape ${current.status} → ${to}`);
          return row!;
        }));
    }),

  /** Lie (ou délie avec null) un devis du module ventes du même tenant. */
  linkQuote: (id: string, quoteId: string | null, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* crmLock.ensureNotLockedByOther(id, owner, locale);
      return yield* dbTransaction("crm.linkQuote", (tx) =>
        Effect.gen(function* () {
          const current = yield* findOpportunity(tx, id, true);
          if (quoteId) {
            const [quote] = yield* dbTry("crm.quote", () => tx.select({ kind: sales.kind }).from(sales).where(and(eq(sales.id, quoteId), sameTenant(sales.organizationId, current.organizationId))).limit(1));
            if (!quote) return yield* fail("NOT_FOUND", "Devis introuvable.");
            if (quote.kind !== "quote") return yield* fail("BAD_REQUEST", "Seul un devis peut être lié.");
          }
          const [row] = yield* dbTry("crm.linkQuote", () => tx.update(crm).set({ quoteId }).where(eq(crm.id, id)).returning());
          yield* revision(tx, row!, owner.userId, quoteId ? "Devis lié" : "Devis délié");
          return row!;
        }));
    }),

  deleteOpportunity: (id: string, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* crmLock.ensureNotLockedByOther(id, owner, locale);
      const rows = yield* dbTry("crm.opportunity.delete", () => getDrizzle().delete(crm).where(eq(crm.id, id)).returning({ id: crm.id }));
      return rows[0] ? { id } : yield* fail("NOT_FOUND", "Opportunité introuvable.");
    }),

  lock: (id: string, owner: LockOwner, options: { takeOver?: boolean; locale?: string } = {}) => crmLock.acquire(id, owner, options),
  unlock: (id: string, owner: LockOwner) => crmLock.release(id, owner),

  // ── Activités ───────────────────────────────────────────────────────────
  createActivity: (input: ActivityInput & { readonly organizationId: string | null }, authorId: string) =>
    dbTransaction("crm.activity.create", (tx) =>
      Effect.gen(function* () {
        const valid = yield* domain(validateActivity({
          kind: input.kind, subject: input.subject, dueAt: input.dueAt ?? null,
          opportunityId: input.opportunityId ?? null, contactId: input.contactId ?? null, companyId: input.companyId ?? null,
        }));
        if (valid.opportunityId) {
          const opportunity = yield* findOpportunity(tx, valid.opportunityId);
          if (opportunity.organizationId !== input.organizationId) return yield* fail("NOT_FOUND", "Opportunité introuvable.");
        }
        yield* ensureRef(tx, crmContacts, valid.contactId, input.organizationId, "Contact");
        yield* ensureRef(tx, crmCompanies, valid.companyId, input.organizationId, "Société");
        const [row] = yield* dbTry("crm.activity.create", () =>
          tx.insert(crmActivities).values({ ...valid, body: input.body?.trim() || null, organizationId: input.organizationId, createdBy: authorId }).returning());
        return row!;
      })),

  /** Marque une activité faite (ou la rouvre). */
  completeActivity: (id: string, done: boolean) =>
    dbTry("crm.activity.complete", () => getDrizzle().update(crmActivities).set({ doneAt: done ? new Date() : null }).where(eq(crmActivities.id, id)).returning()).pipe(
      Effect.flatMap((rows) => (rows[0] ? Effect.succeed(rows[0]) : fail("NOT_FOUND", "Activité introuvable."))),
    ),

  deleteActivity: (id: string) =>
    dbTry("crm.activity.delete", () => getDrizzle().delete(crmActivities).where(eq(crmActivities.id, id)).returning({ id: crmActivities.id })).pipe(
      Effect.flatMap((rows) => (rows[0] ? Effect.succeed({ id }) : fail("NOT_FOUND", "Activité introuvable."))),
    ),
};
