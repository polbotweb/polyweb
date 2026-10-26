/**
 * Service Effect du domaine sales : brouillons (création / mise à jour avec recalcul des totaux),
 * transitions de workflow par type, émission numérotée sans trou (core/numbering, dans la même
 * transaction que le changement de statut), conversion devis → facture, avoirs plafonnés,
 * encaissements (verrou ligne `FOR UPDATE`) et relances. Accès base via `dbTry` / `dbTransaction`,
 * verrou d'édition via core/locks, révisions à chaque écriture.
 */
import { Effect } from "effect";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/action";
import { canTransition } from "@/core/workflow";
import { assignDocumentNumber } from "@/core/numbering";
import { parseCurrency } from "@/core/money";
import type { LockOwner } from "@/core/locks/policy";
import { taxActiveRates } from "@/modules/tax/loaders/tax-rate-admin.loader";
import type { CustomerType, SupplyType } from "@/modules/tax/domain/rules";
import { sales, salesDocumentLines, salesDocumentRevisions, salesPayments, salesReminders } from "../schema";
import { salesLock } from "../locks";
import { DERIVED_SALES_STATUSES, isLocked, workflowFor, type SalesDocumentKind, type SalesStatus } from "../domain/workflow";
import { computeSalesTotals, type SalesLineInput } from "../domain/lines";
import { DEFAULT_SALES_NUMBERING, NUMBERED_AT, SALES_NUMBERING_KEYS } from "../domain/numbering";
import { CREDITABLE_INVOICE_STATUSES, validateCreditAmount } from "../domain/credit";
import { invoiceStatusFromBalance, validatePayment, type PaymentMethod } from "../domain/payments";
import { dueDateFrom, nextReminderLevel, daysOverdue } from "../domain/reminders";

export type SalesDocumentRow = typeof sales.$inferSelect;
export type SalesLineRow = typeof salesDocumentLines.$inferSelect;
type Executor = ReturnType<typeof getDrizzle> | DbTransaction;

export interface SalesPartyInput {
  readonly title: string;
  readonly customerName: string;
  readonly customerEmail?: string | null;
  readonly customerAddress?: string | null;
  readonly customerCountry: string;
  readonly customerType: CustomerType;
  readonly customerVatNumber?: string | null;
  readonly sellerCountry: string;
  readonly supplyType: SupplyType;
  readonly ossRegistered?: boolean;
  readonly currency: string;
  readonly validUntil?: string | null;
  readonly paymentTermDays?: number;
  readonly notes?: string | null;
}

export interface SalesDocumentInput extends SalesPartyInput {
  readonly kind: SalesDocumentKind;
  readonly organizationId: string | null;
  readonly lines: readonly SalesLineInput[];
}

/** Date du jour (AAAA-MM-JJ, UTC). */
export const salesToday = () => new Date().toISOString().slice(0, 10);

const findById = (executor: Executor, id: string, forUpdate = false) =>
  dbTry("sales.findById", () => {
    const query = executor.select().from(sales).where(eq(sales.id, id)).limit(1);
    return forUpdate ? query.for("update") : query;
  }).pipe(Effect.map((rows): SalesDocumentRow | null => rows[0] ?? null));

const required = (executor: Executor, id: string, forUpdate = false) =>
  Effect.flatMap(findById(executor, id, forUpdate), (row) => (row ? Effect.succeed(row) : fail("NOT_FOUND", "Document introuvable.")));

export const salesLinesOf = (executor: Executor, documentId: string) =>
  dbTry("sales.lines", () => executor.select().from(salesDocumentLines).where(eq(salesDocumentLines.documentId, documentId)).orderBy(asc(salesDocumentLines.position)));

const revision = (executor: Executor, row: SalesDocumentRow, authorId: string, note: string) =>
  dbTry("sales.revision", () => executor.insert(salesDocumentRevisions).values({ resourceId: row.id, authorId, title: row.title, slug: row.slug, status: row.status, number: row.number, grossMinor: row.grossMinor, note }));

const tenantRates = (organizationId: string | null) =>
  Effect.map(Effect.all([taxActiveRates(null), organizationId ? taxActiveRates(organizationId) : Effect.succeed([])]), ([platform, own]) => [...own, ...platform]);

const toLineInput = (line: SalesLineRow): SalesLineInput => ({
  description: line.description,
  quantity: String(Number(line.quantity)),
  unitPriceMinor: line.unitPriceMinor,
  discountPercent: String(Number(line.discountPercent)),
  taxCategory: line.taxCategory,
});

/** Totaux + lignes calculées pour un document et une date (taux du tenant puis taux par défaut). */
const price = (party: SalesPartyInput & { readonly kind: SalesDocumentKind; readonly organizationId: string | null }, lines: readonly SalesLineInput[], date: string) =>
  Effect.gen(function* () {
    const currency = yield* parseCurrency(party.currency);
    const rates = yield* tenantRates(party.organizationId);
    return yield* computeSalesTotals({
      kind: party.kind,
      currency,
      date,
      lines,
      rates,
      context: {
        sellerCountry: party.sellerCountry,
        buyerCountry: party.customerCountry,
        customerType: party.customerType,
        buyerVatNumber: party.customerVatNumber ?? null,
        supplyType: party.supplyType,
        ossRegistered: party.ossRegistered ?? false,
      },
    });
  });

type Priced = Effect.Success<ReturnType<typeof price>>;

const totalsColumns = (priced: Priced) => ({
  netMinor: priced.totals.net.amountMinor,
  taxMinor: priced.totals.tax.amountMinor,
  grossMinor: priced.totals.gross.amountMinor,
  taxMention: priced.determination.mention,
});

const writeLines = (executor: Executor, documentId: string, priced: Priced) =>
  Effect.gen(function* () {
    yield* dbTry("sales.lines.clear", () => executor.delete(salesDocumentLines).where(eq(salesDocumentLines.documentId, documentId)));
    yield* dbTry("sales.lines.insert", () =>
      executor.insert(salesDocumentLines).values(priced.lines.map((line, position) => ({
        documentId,
        position,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        discountPercent: line.discountPercent ?? "0",
        taxCategory: line.taxCategory,
        ratePercent: priced.taxLines[position]?.ratePercent ?? "0",
        netMinor: line.net.amountMinor,
      }))));
  });

const partyColumns = (input: SalesPartyInput) => ({
  title: input.title,
  customerName: input.customerName,
  customerEmail: input.customerEmail ?? null,
  customerAddress: input.customerAddress ?? null,
  customerCountry: input.customerCountry.toUpperCase(),
  customerType: input.customerType,
  customerVatNumber: input.customerVatNumber ?? null,
  sellerCountry: input.sellerCountry.toUpperCase(),
  supplyType: input.supplyType,
  ossRegistered: input.ossRegistered ?? false,
  currency: input.currency.toUpperCase(),
  validUntil: input.validUntil ?? null,
  paymentTermDays: input.paymentTermDays ?? 30,
  notes: input.notes ?? null,
});

const partyOf = (row: SalesDocumentRow): SalesPartyInput => ({ ...row });

const draftSlug = (kind: SalesDocumentKind) => `${kind.replace("_", "-")}-${crypto.randomUUID().slice(0, 8)}`;

const insertDraft = (executor: Executor, input: SalesDocumentInput & { readonly sourceDocumentId?: string | null }, authorId: string, date: string) =>
  Effect.gen(function* () {
    const priced = yield* price(input, input.lines, date);
    const [row] = yield* dbTry("sales.create", () =>
      executor.insert(sales).values({
        ...partyColumns(input),
        ...totalsColumns(priced),
        kind: input.kind,
        organizationId: input.organizationId,
        slug: draftSlug(input.kind),
        sourceDocumentId: input.sourceDocumentId ?? null,
        createdBy: authorId,
      }).returning());
    yield* writeLines(executor, row.id, priced);
    yield* revision(executor, row, authorId, "Création");
    return row;
  });

/** Transitions dérivées : posées par les encaissements / avoirs / conversions, jamais à la main. */
const DERIVED = DERIVED_SALES_STATUSES;

/** Émission : numéro sans trou + date + échéance + totaux figés à la date d'émission. */
const issue = (tx: DbTransaction, row: SalesDocumentRow, to: SalesStatus, today: string) =>
  Effect.gen(function* () {
    const lines = (yield* salesLinesOf(tx, row.id)).map(toLineInput);
    const priced = yield* price({ ...partyOf(row), kind: row.kind, organizationId: row.organizationId }, lines, today);
    if (row.kind === "credit_note") {
      if (!row.sourceDocumentId) return yield* fail("BAD_REQUEST", "Avoir sans facture d'origine.");
      const invoice = yield* required(tx, row.sourceDocumentId, true);
      if (!CREDITABLE_INVOICE_STATUSES.includes(invoice.status)) return yield* fail("BAD_REQUEST", "Facture d'origine non créditable (" + invoice.status + ").");
      yield* validateCreditAmount({ invoiceGrossMinor: invoice.grossMinor, alreadyCreditedMinor: invoice.creditedMinor, requestedMinor: priced.totals.gross.amountMinor }).pipe(
        Effect.catch(() => fail("BAD_REQUEST", "Avoir supérieur au restant créditable de la facture.")),
      );
      const creditedMinor = invoice.creditedMinor + priced.totals.gross.amountMinor;
      const status = invoiceStatusFromBalance({ grossMinor: invoice.grossMinor, paidMinor: invoice.paidMinor, creditedMinor });
      yield* dbTry("sales.credit.apply", () => tx.update(sales).set({ creditedMinor, status }).where(eq(sales.id, invoice.id)));
    }
    const { number } = yield* assignDocumentNumber(tx, { organizationId: row.organizationId, key: SALES_NUMBERING_KEYS[row.kind], scheme: DEFAULT_SALES_NUMBERING[row.kind], date: today });
    const dueDate = row.kind === "invoice" ? yield* dueDateFrom(today, row.paymentTermDays) : null;
    yield* writeLines(tx, row.id, priced);
    const [updated] = yield* dbTry("sales.issue", () =>
      tx.update(sales).set({ ...totalsColumns(priced), status: to, number, issueDate: today, dueDate }).where(eq(sales.id, row.id)).returning());
    return updated;
  });

export const salesService = {
  create: (input: SalesDocumentInput, authorId: string, today = salesToday()) =>
    dbTransaction("sales.create", (tx) => insertDraft(tx, input, authorId, today)),

  /** Mise à jour d'un brouillon (en-tête et/ou lignes) avec recalcul des totaux. */
  update: (id: string, patch: Partial<SalesPartyInput> & { readonly lines?: readonly SalesLineInput[] }, owner: LockOwner, locale?: string, today = salesToday()) =>
    Effect.gen(function* () {
      yield* salesLock.ensureNotLockedByOther(id, owner, locale);
      return yield* dbTransaction("sales.update", (tx) =>
        Effect.gen(function* () {
          const current = yield* required(tx, id, true);
          if (isLocked(current.kind, current.status)) return yield* fail("BAD_REQUEST", "Document émis : modification impossible (émettre un avoir).");
          const party: SalesPartyInput = { ...partyOf(current), ...patch };
          const lines = patch.lines ?? (yield* salesLinesOf(tx, id)).map(toLineInput);
          const priced = yield* price({ ...party, kind: current.kind, organizationId: current.organizationId }, lines, today);
          const [row] = yield* dbTry("sales.update", () => tx.update(sales).set({ ...partyColumns(party), ...totalsColumns(priced) }).where(eq(sales.id, id)).returning());
          yield* writeLines(tx, id, priced);
          yield* revision(tx, row, owner.userId, "Mise à jour");
          return row;
        }));
    }),

  /** Transition manuelle (envoi, acceptation, émission, annulation…) ; numérotation à l'étape légale. */
  transition: (id: string, to: SalesStatus, owner: LockOwner, locale?: string, today = salesToday()) =>
    Effect.gen(function* () {
      yield* salesLock.ensureNotLockedByOther(id, owner, locale);
      return yield* dbTransaction("sales.transition", (tx) =>
        Effect.gen(function* () {
          const current = yield* required(tx, id, true);
          if (DERIVED.includes(to) || !canTransition(workflowFor(current.kind), current.status, to)) {
            return yield* fail("BAD_REQUEST", "Transition de statut invalide : " + current.status + " → " + to + ".");
          }
          const row = to === NUMBERED_AT[current.kind] && !current.number
            ? yield* issue(tx, current, to, today)
            : (yield* dbTry("sales.transition", () => tx.update(sales).set({ status: to }).where(eq(sales.id, id)).returning()))[0];
          yield* revision(tx, row, owner.userId, "Transition " + current.status + " → " + to);
          return row;
        }));
    }),

  /** Devis accepté → facture brouillon (lignes copiées), devis CONVERTED. */
  convertQuote: (quoteId: string, authorId: string, today = salesToday()) =>
    dbTransaction("sales.convertQuote", (tx) =>
      Effect.gen(function* () {
        const quote = yield* required(tx, quoteId, true);
        if (quote.kind !== "quote" || quote.status !== "ACCEPTED") return yield* fail("BAD_REQUEST", "Seul un devis accepté peut être converti.");
        const lines = (yield* salesLinesOf(tx, quoteId)).map(toLineInput);
        const invoice = yield* insertDraft(tx, { ...partyOf(quote), kind: "invoice", organizationId: quote.organizationId, lines, sourceDocumentId: quote.id, validUntil: null }, authorId, today);
        const [converted] = yield* dbTry("sales.quote.converted", () => tx.update(sales).set({ status: "CONVERTED" }).where(eq(sales.id, quoteId)).returning());
        yield* revision(tx, converted, authorId, "Converti en facture");
        return invoice;
      })),

  /** Avoir brouillon sur une facture émise : lignes fournies (partiel) ou copie intégrale (total). */
  createCreditNote: (invoiceId: string, authorId: string, options: { readonly lines?: readonly SalesLineInput[]; readonly title?: string } = {}, today = salesToday()) =>
    dbTransaction("sales.createCreditNote", (tx) =>
      Effect.gen(function* () {
        const invoice = yield* required(tx, invoiceId, true);
        if (invoice.kind !== "invoice" || !CREDITABLE_INVOICE_STATUSES.includes(invoice.status)) return yield* fail("BAD_REQUEST", "Seule une facture émise peut faire l'objet d'un avoir.");
        const lines = options.lines ?? (yield* salesLinesOf(tx, invoiceId)).map(toLineInput);
        return yield* insertDraft(tx, { ...partyOf(invoice), title: options.title ?? "Avoir sur " + invoice.number, kind: "credit_note", organizationId: invoice.organizationId, lines, sourceDocumentId: invoice.id, validUntil: null }, authorId, today);
      })),

  /** Encaissement : facture verrouillée (FOR UPDATE), plafonné au restant dû, statut recalculé. */
  recordPayment: (invoiceId: string, input: { readonly amountMinor: number; readonly method: PaymentMethod; readonly paidAt: string; readonly reference?: string | null }, authorId: string) =>
    dbTransaction("sales.recordPayment", (tx) =>
      Effect.gen(function* () {
        const invoice = yield* required(tx, invoiceId, true);
        if (invoice.kind !== "invoice") return yield* fail("BAD_REQUEST", "Encaissement uniquement sur une facture.");
        const balance = { grossMinor: invoice.grossMinor, paidMinor: invoice.paidMinor, creditedMinor: invoice.creditedMinor };
        yield* validatePayment(invoice.status, balance, input.amountMinor).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
        const [payment] = yield* dbTry("sales.payment.insert", () =>
          tx.insert(salesPayments).values({ documentId: invoice.id, organizationId: invoice.organizationId, amountMinor: input.amountMinor, currency: invoice.currency, method: input.method, paidAt: input.paidAt, reference: input.reference ?? null, createdBy: authorId }).returning());
        const paidMinor = invoice.paidMinor + input.amountMinor;
        const status = invoiceStatusFromBalance({ ...balance, paidMinor });
        const [row] = yield* dbTry("sales.payment.apply", () => tx.update(sales).set({ paidMinor, status }).where(eq(sales.id, invoice.id)).returning());
        yield* revision(tx, row, authorId, "Encaissement " + input.amountMinor);
        return { payment, document: row };
      })),

  /** Relance : enregistre le prochain niveau dû (unique par facture et niveau), ou null si rien à relancer. */
  recordReminder: (invoiceId: string, authorId: string | null, today = salesToday()) =>
    dbTransaction("sales.recordReminder", (tx) =>
      Effect.gen(function* () {
        const invoice = yield* required(tx, invoiceId, true);
        if (invoice.kind !== "invoice" || !["ISSUED", "PARTIALLY_PAID"].includes(invoice.status) || !invoice.dueDate) return null;
        const level = yield* nextReminderLevel({ dueDate: invoice.dueDate, today, sentLevel: invoice.reminderLevel });
        if (level === null) return null;
        const overdue = yield* daysOverdue(invoice.dueDate, today);
        yield* dbTry("sales.reminder.insert", () => tx.insert(salesReminders).values({ documentId: invoice.id, level, daysOverdue: overdue, sentBy: authorId }));
        yield* dbTry("sales.reminder.level", () => tx.update(sales).set({ reminderLevel: level }).where(eq(sales.id, invoice.id)));
        return { documentId: invoice.id, number: invoice.number, level, daysOverdue: overdue, customerEmail: invoice.customerEmail };
      })),

  /** Factures ouvertes échues d'un tenant (candidates à relance). */
  overdueInvoices: (organizationId: string | null, today = salesToday()) =>
    dbTry("sales.overdue", () =>
      getDrizzle().select().from(sales).where(and(
        organizationId === null ? isNull(sales.organizationId) : eq(sales.organizationId, organizationId),
        eq(sales.kind, "invoice"),
        inArray(sales.status, ["ISSUED", "PARTIALLY_PAID"]),
        sql`${sales.dueDate} < ${today}`,
      ))),

  lock: (id: string, owner: LockOwner, options: { takeOver?: boolean; locale?: string } = {}) => salesLock.acquire(id, owner, options),
  unlock: (id: string, owner: LockOwner) => salesLock.release(id, owner),
};
