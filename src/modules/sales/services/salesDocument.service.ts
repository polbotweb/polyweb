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
import { fail } from "@/lib/effect/failure";
import { canTransition } from "@/core/workflow";
import { assignDocumentNumber } from "@/core/numbering";
import { allocate, parseCurrency } from "@/core/money";
import type { LockOwner } from "@/core/locks/policy";
import { taxActiveRates } from "@/modules/tax/loaders/tax-rate-admin.loader";
import type { CustomerType, SupplyType, TaxCategory } from "@/modules/tax/domain/rules";
import type { TaxRateEntry } from "@/modules/tax/domain/rates";
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

/** Révision d'un document ; ignorée pour une écriture système (sans auteur, tracée par l'audit). */
const revision = (executor: Executor, row: SalesDocumentRow, authorId: string | null, note: string) =>
  authorId === null
    ? Effect.void
    : dbTry("sales.revision", () => executor.insert(salesDocumentRevisions).values({ resourceId: row.id, authorId, title: row.title, slug: row.slug, status: row.status, number: row.number, grossMinor: row.grossMinor, note })).pipe(Effect.asVoid);

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
const price = (party: SalesPartyInput & { readonly kind: SalesDocumentKind; readonly organizationId: string | null }, lines: readonly SalesLineInput[], date: string, preloadedRates?: readonly TaxRateEntry[]) =>
  Effect.gen(function* () {
    const currency = yield* parseCurrency(party.currency);
    const rates = preloadedRates ?? (yield* tenantRates(party.organizationId));
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

const insertDraft = (executor: Executor, input: SalesDocumentInput & { readonly sourceDocumentId?: string | null }, authorId: string | null, date: string) =>
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

// ─── Avoirs de remboursement (core/refunds) ─────────────────────────

const refundLine = (invoice: SalesDocumentRow, taxCategory: TaxCategory, unitPriceMinor: number): SalesLineInput => ({
  description: "Remboursement" + (invoice.number ? " — facture " + invoice.number : ""), quantity: "1", unitPriceMinor, discountPercent: "0", taxCategory,
});

/**
 * Lignes d'un avoir dont le TTC vaut exactement `amountMinor` (en vigueur à `today`), ou null si
 * ce montant n'est pas atteignable (arrondi de TVA : certains TTC n'existent pas pour un HT entier).
 * Total sans avoir antérieur → copie intégrale des lignes ; sinon une ligne par catégorie de taxe,
 * TTC réparti au prorata de la facture (plus fort reste), HT trouvé par dichotomie (TTC croissant en HT).
 */
const refundCreditPlan = (executor: Executor, invoice: SalesDocumentRow, amountMinor: number, today: string) =>
  Effect.gen(function* () {
    const party = { ...partyOf(invoice), kind: "credit_note" as const, organizationId: invoice.organizationId };
    const rates = yield* tenantRates(invoice.organizationId);
    const grossOf = (lines: readonly SalesLineInput[]) => Effect.map(price(party, lines, today, rates), (priced) => priced.totals.gross.amountMinor);
    const invoiceLines = yield* salesLinesOf(executor, invoice.id);
    if (invoiceLines.length === 0 || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;
    if (invoice.creditedMinor === 0 && amountMinor === invoice.grossMinor) {
      const copy = invoiceLines.map(toLineInput);
      if ((yield* grossOf(copy)) === amountMinor) return copy;
    }
    const weights = new Map<TaxCategory, number>();
    for (const line of invoiceLines) {
      const weight = Math.max(0, line.netMinor) * (10_000 + Math.round(Number(line.ratePercent) * 100));
      weights.set(line.taxCategory, (weights.get(line.taxCategory) ?? 0) + weight);
    }
    const categories = [...weights.entries()].filter(([, w]) => w > 0).sort((a, b) => a[1] - b[1]);
    if (categories.length === 0) return null;
    const currency = yield* parseCurrency(invoice.currency);
    const targets = yield* allocate({ amountMinor, currency }, categories.map(([, w]) => w));
    const lines: SalesLineInput[] = [];
    let carry = 0;
    for (const [index, [category]] of categories.entries()) {
      const target = targets[index]!.amountMinor + carry;
      // Plus grand HT dont le TTC ne dépasse pas la cible ; le reste passe à la catégorie suivante.
      let low = 0;
      let high = target;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if ((yield* grossOf([refundLine(invoice, category, mid)])) <= target) low = mid;
        else high = mid - 1;
      }
      const reached = low > 0 ? yield* grossOf([refundLine(invoice, category, low)]) : 0;
      carry = target - reached;
      if (low > 0) lines.push(refundLine(invoice, category, low));
    }
    if (carry !== 0 || lines.length === 0) return null;
    return (yield* grossOf(lines)) === amountMinor ? lines : null;
  });

/** Restant créditable d'une facture et faisabilité d'un avoir de remboursement exact. */
export const checkRefundCredit = (executor: Executor, invoiceId: string, amountMinor: number, today = salesToday()) =>
  Effect.gen(function* () {
    const invoice = yield* findById(executor, invoiceId);
    if (!invoice || invoice.kind !== "invoice") return { ok: false as const, reason: "not_invoice" };
    if (!CREDITABLE_INVOICE_STATUSES.includes(invoice.status)) return { ok: false as const, reason: "status:" + invoice.status };
    if (amountMinor > invoice.grossMinor - invoice.creditedMinor) return { ok: false as const, reason: "exceeds_creditable" };
    if (amountMinor > invoice.paidMinor) return { ok: false as const, reason: "exceeds_paid" };
    const plan = yield* refundCreditPlan(executor, invoice, amountMinor, today);
    return plan ? { ok: true as const, invoice } : { ok: false as const, reason: "unreachable_amount" };
  });

/**
 * Avoir émis + remboursement enregistré (encaissement négatif `card`, référence = remboursement),
 * dans la transaction appelante. Montant inatteignable exactement → avoir laissé en brouillon
 * (copie des lignes, à ajuster par l'administration) et `issued: false`.
 */
export const issueRefundCreditNote = (tx: DbTransaction, invoiceId: string, input: { readonly amountMinor: number; readonly refundId: string; readonly authorId: string | null; readonly paidAt: string }, today = salesToday()) =>
  Effect.gen(function* () {
    const invoice = yield* required(tx, invoiceId, true);
    if (invoice.kind !== "invoice" || !CREDITABLE_INVOICE_STATUSES.includes(invoice.status)) return yield* fail("BAD_REQUEST", "Facture non créditable (" + invoice.status + ").");
    const [existing] = yield* dbTry("sales.refund.payment.find", () =>
      tx.select({ id: salesPayments.id }).from(salesPayments).where(and(eq(salesPayments.documentId, invoice.id), eq(salesPayments.reference, input.refundId))).limit(1));
    if (existing) return { creditNote: null, issued: false, duplicate: true };
    const plan = yield* refundCreditPlan(tx, invoice, input.amountMinor, today);
    const title = "Avoir — remboursement" + (invoice.number ? " " + invoice.number : "");
    const lines = plan ?? (yield* salesLinesOf(tx, invoice.id)).map(toLineInput);
    const draft = yield* insertDraft(tx, { ...partyOf(invoice), title, kind: "credit_note", organizationId: invoice.organizationId, lines, sourceDocumentId: invoice.id, validUntil: null }, input.authorId, today);
    if (!plan) return { creditNote: draft, issued: false, duplicate: false };
    const creditNote = yield* issue(tx, draft, NUMBERED_AT.credit_note, today);
    yield* revision(tx, creditNote, input.authorId, "Émis (remboursement " + input.refundId + ")");
    const credited = yield* required(tx, invoice.id, true);
    yield* dbTry("sales.refund.payment", () =>
      tx.insert(salesPayments).values({ documentId: invoice.id, organizationId: invoice.organizationId, amountMinor: -input.amountMinor, currency: invoice.currency, method: "card", paidAt: input.paidAt, reference: input.refundId, createdBy: input.authorId }));
    const paidMinor = credited.paidMinor - input.amountMinor;
    const status = invoiceStatusFromBalance({ grossMinor: credited.grossMinor, paidMinor, creditedMinor: credited.creditedMinor });
    const [row] = yield* dbTry("sales.refund.apply", () => tx.update(sales).set({ paidMinor, status }).where(eq(sales.id, invoice.id)).returning());
    yield* revision(tx, row, input.authorId, "Remboursement " + input.amountMinor);
    return { creditNote, issued: true, duplicate: false };
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
