/**
 * Sources de rapprochement bancaire du module ventes (registre core/reconciliation) :
 * - `sales-invoice` (encaissements) : factures émises au restant dû > 0 ;
 * - `sales-refund` (décaissements) : factures trop payées après avoir (remboursement client).
 * L'imputation crée un vrai règlement `sales_payments` (compte bancaire, rapprochement, lettrage)
 * et recalcule le solde par `applyInvoiceBalance` (statut, événement `invoice.paid`), dans la
 * transaction du rapprochement. L'annulation contre-passe par un règlement opposé, sans suppression.
 */
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { openInLineCurrency, referenceTokens, registerReconciliationSource, type CandidateQuery, type ReconCandidate, type ReconciliationSource } from "@/core/reconciliation";
import { fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import { customerAuxAccount } from "./domain/fec";
import { sales, salesPayments } from "./schema";
import { applyInvoiceBalance } from "./services/balance";

type InvoiceRow = typeof sales.$inferSelect;
const tenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));
const normalizedNumber = sql`regexp_replace(upper(coalesce(${sales.number}, '')), '[^A-Z0-9]', '', 'g')`;
const OPEN = ["ISSUED", "PARTIALLY_PAID"] as const;
const due = (row: Pick<InvoiceRow, "grossMinor" | "paidMinor" | "creditedMinor">) => row.grossMinor - row.paidMinor - row.creditedMinor;

const toCandidate = (row: InvoiceRow, source: string, direction: "in" | "out", openMinor: number, query: CandidateQuery) =>
  openInLineCurrency({ openMinor, documentCurrency: row.currency, baseRate: row.exchangeRate, lineCurrency: query.line.currency }).pipe(
    Effect.map((lineOpen): ReconCandidate | null => lineOpen === null || lineOpen <= 0 ? null : {
      source, id: row.id, direction, openMinor: lineOpen, currency: query.line.currency,
      ...(row.currency !== query.line.currency ? { originalMinor: openMinor, originalCurrency: row.currency } : {}),
      date: row.dueDate ?? row.issueDate, references: [row.number ?? ""].filter(Boolean),
      counterpartyName: row.customerName, counterpartyIbans: [], groupKey: customerAuxAccount(row.customerName, row.customerVatNumber),
      label: `${row.number ?? row.title} — ${row.customerName}`, baseRate: row.exchangeRate, documentOpenMinor: openMinor, documentCurrency: row.currency,
    }),
  );

/** Lecture bornée : pièces citées (ids, numéros présents dans le libellé), recherche libre, puis montants proches. */
const findInvoices = (query: CandidateQuery, scope: SQL, openExpr: SQL) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const base = and(tenant(sales.organizationId, query.organizationId), eq(sales.kind, "invoice"), scope)!;
    if (query.ids?.length) return yield* dbTry("sales.recon.ids", () => db.select().from(sales).where(and(base, inArray(sales.id, [...query.ids!]))).limit(query.limit));
    const search = query.search?.trim();
    if (search) {
      const like = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      return yield* dbTry("sales.recon.search", () => db.select().from(sales)
        .where(and(base, or(sql`${sales.number} ilike ${like}`, sql`${sales.customerName} ilike ${like}`)))
        .orderBy(desc(sales.issueDate)).limit(query.limit));
    }
    const tokens = referenceTokens(query.line);
    const cited = tokens.length ? yield* dbTry("sales.recon.cited", () => db.select().from(sales).where(and(base, inArray(normalizedNumber, tokens))).limit(query.limit)) : [];
    const target = Math.abs(query.line.amountMinor);
    const near = yield* dbTry("sales.recon.near", () => db.select().from(sales).where(base)
      .orderBy(sql`abs((${openExpr}) - ${target})`, desc(sales.issueDate)).limit(query.limit));
    const seen = new Set<string>();
    return [...cited, ...near].filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
  });

const lockInvoice = (tx: DbTransaction, id: string, organizationId: string | null) =>
  Effect.gen(function* () {
    const [row] = yield* dbTry("sales.recon.lock", () => tx.select().from(sales).where(and(eq(sales.id, id), tenant(sales.organizationId, organizationId))).limit(1).for("update"));
    if (!row || row.kind !== "invoice") return yield* fail("NOT_FOUND", "Facture introuvable.");
    return row;
  });

/** Contre-passation : règlement opposé daté du jour de l'annulation, lettrage retiré. */
const reverseSalesPayments: ReconciliationSource["reverse"] = (tx, input) =>
  Effect.gen(function* () {
    const ids = input.effects.filter((effect) => effect.table === "sales_payments").map((effect) => effect.id);
    if (ids.length === 0) return;
    const payments = yield* dbTry("sales.recon.reverse.payments", () => tx.select().from(salesPayments).where(inArray(salesPayments.id, ids)));
    for (const payment of payments) {
      const [invoice] = yield* dbTry("sales.recon.reverse.lock", () => tx.select().from(sales).where(eq(sales.id, payment.documentId)).limit(1).for("update"));
      if (!invoice) continue;
      yield* dbTry("sales.recon.reverse.insert", () => tx.insert(salesPayments).values({
        documentId: invoice.id, organizationId: invoice.organizationId, amountMinor: -payment.amountMinor, currency: payment.currency, method: payment.method,
        paidAt: input.date, reference: `Annulation ${payment.reference ?? ""}`.trim().slice(0, 140), bankAccountId: payment.bankAccountId, reconciliationId: input.reconciliationId, createdBy: input.actorId,
      }));
      yield* dbTry("sales.recon.reverse.unletter", () => tx.update(salesPayments).set({ letteringCode: null, letteringDate: null }).where(eq(salesPayments.id, payment.id)));
      yield* dbTry("sales.recon.reverse.unletterDoc", () => tx.update(sales).set({ letteringCode: null, letteringDate: null }).where(eq(sales.id, invoice.id)));
      yield* applyInvoiceBalance(tx, invoice, { paidMinor: invoice.paidMinor - payment.amountMinor }, "sales.recon.reverse.balance");
    }
  });

export const salesInvoiceSource: ReconciliationSource = {
  key: "sales-invoice",
  direction: "in",
  findCandidates: (query) =>
    Effect.gen(function* () {
      if (query.line.amountMinor <= 0) return [];
      const rows = yield* findInvoices(query, inArray(sales.status, [...OPEN]), sql`${sales.grossMinor} - ${sales.paidMinor} - ${sales.creditedMinor}`);
      const out: ReconCandidate[] = [];
      for (const row of rows) {
        if (!(OPEN as readonly string[]).includes(row.status) || due(row) <= 0) continue;
        const candidate = yield* toCandidate(row, "sales-invoice", "in", due(row), query);
        if (candidate) out.push(candidate);
      }
      return out;
    }),
  apply: (tx, input) =>
    Effect.gen(function* () {
      const invoice = yield* lockInvoice(tx, input.candidateId, input.organizationId);
      if (!(OPEN as readonly string[]).includes(invoice.status)) return yield* fail("BAD_REQUEST", `Facture ${invoice.number ?? invoice.id} non ouverte (${invoice.status}).`);
      if (input.amountMinor <= 0 || input.amountMinor > due(invoice)) return yield* fail("BAD_REQUEST", `Montant imputé hors du restant dû de ${invoice.number ?? invoice.id}.`);
      const settled = input.amountMinor === due(invoice);
      const code = settled ? yield* input.lettering() : null;
      const [payment] = yield* dbTry("sales.recon.payment", () => tx.insert(salesPayments).values({
        documentId: invoice.id, organizationId: invoice.organizationId, amountMinor: input.amountMinor, currency: invoice.currency, method: "bank_transfer",
        paidAt: input.paidAt, reference: input.reference.slice(0, 140), bankAccountId: input.bankAccountId, reconciliationId: input.reconciliationId,
        letteringCode: code, letteringDate: code ? input.paidAt : null, createdBy: input.actorId,
      }).returning());
      if (code) {
        // Lettrage complet : la facture et TOUS ses règlements non lettrés reçoivent le même code.
        yield* dbTry("sales.recon.letterDoc", () => tx.update(sales).set({ letteringCode: code, letteringDate: input.paidAt }).where(eq(sales.id, invoice.id)));
        yield* dbTry("sales.recon.letterPayments", () => tx.update(salesPayments).set({ letteringCode: code, letteringDate: input.paidAt })
          .where(and(eq(salesPayments.documentId, invoice.id), isNull(salesPayments.letteringCode))));
      }
      yield* applyInvoiceBalance(tx, invoice, { paidMinor: invoice.paidMinor + input.amountMinor }, "sales.recon.balance");
      return {
        paymentId: payment!.id, settled, documentNumber: invoice.number ?? invoice.id,
        effects: [{ table: "sales_payments", id: payment!.id }],
        aux: { account: customerAuxAccount(invoice.customerName, invoice.customerVatNumber), label: invoice.customerName },
      };
    }),
  reverse: reverseSalesPayments,
};

/** Trop payé après avoir : `paid − (gross − credited)` > 0, remboursé au client (décaissement). */
const refundable = (row: Pick<InvoiceRow, "grossMinor" | "paidMinor" | "creditedMinor">) => row.paidMinor - Math.max(0, row.grossMinor - row.creditedMinor);

export const salesRefundSource: ReconciliationSource = {
  key: "sales-refund",
  direction: "out",
  findCandidates: (query) =>
    Effect.gen(function* () {
      if (query.line.amountMinor >= 0) return [];
      const rows = yield* findInvoices(query, sql`${sales.paidMinor} > greatest(0, ${sales.grossMinor} - ${sales.creditedMinor})`, sql`${sales.paidMinor} - greatest(0, ${sales.grossMinor} - ${sales.creditedMinor})`);
      const out: ReconCandidate[] = [];
      for (const row of rows) {
        const open = refundable(row);
        if (open <= 0) continue;
        const candidate = yield* toCandidate(row, "sales-refund", "out", open, query);
        if (candidate) out.push({ ...candidate, label: `Remboursement ${candidate.label}` });
      }
      return out;
    }),
  apply: (tx, input) =>
    Effect.gen(function* () {
      const invoice = yield* lockInvoice(tx, input.candidateId, input.organizationId);
      const open = refundable(invoice);
      if (input.amountMinor <= 0 || input.amountMinor > open) return yield* fail("BAD_REQUEST", `Remboursement hors du trop-perçu de ${invoice.number ?? invoice.id}.`);
      const settled = input.amountMinor === open;
      const code = settled ? yield* input.lettering() : null;
      const [payment] = yield* dbTry("sales.recon.refund", () => tx.insert(salesPayments).values({
        documentId: invoice.id, organizationId: invoice.organizationId, amountMinor: -input.amountMinor, currency: invoice.currency, method: "bank_transfer",
        paidAt: input.paidAt, reference: input.reference.slice(0, 140), bankAccountId: input.bankAccountId, reconciliationId: input.reconciliationId,
        letteringCode: code, letteringDate: code ? input.paidAt : null, createdBy: input.actorId,
      }).returning());
      if (code) {
        yield* dbTry("sales.recon.refund.letterDoc", () => tx.update(sales).set({ letteringCode: code, letteringDate: input.paidAt }).where(eq(sales.id, invoice.id)));
        yield* dbTry("sales.recon.refund.letterPayments", () => tx.update(salesPayments).set({ letteringCode: code, letteringDate: input.paidAt })
          .where(and(eq(salesPayments.documentId, invoice.id), isNull(salesPayments.letteringCode))));
      }
      yield* applyInvoiceBalance(tx, invoice, { paidMinor: invoice.paidMinor - input.amountMinor }, "sales.recon.refund.balance");
      return {
        paymentId: payment!.id, settled, documentNumber: invoice.number ?? invoice.id,
        effects: [{ table: "sales_payments", id: payment!.id }],
        aux: { account: customerAuxAccount(invoice.customerName, invoice.customerVatNumber), label: invoice.customerName },
      };
    }),
  reverse: reverseSalesPayments,
};

/** Idempotent : appelé au démarrage (bootstrap). */
export const registerSalesReconciliation = (): void => {
  registerReconciliationSource(salesInvoiceSource);
  registerReconciliationSource(salesRefundSource);
};
