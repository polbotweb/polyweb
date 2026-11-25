/**
 * Sources de rapprochement bancaire du module achats (registre core/reconciliation) :
 * - `purchasing-invoice` (décaissements) : factures fournisseur ouvertes ;
 * - `purchasing-refund` (encaissements) : remboursement d'un trop payé après avoir fournisseur ;
 * - `purchasing-sepa` (décaissements) : débit global d'un lot SEPA (pain.001) — un règlement par
 *   ordre du lot, lot marqué EXECUTED ;
 * - `purchasing-sepa-return` (encaissements) : retour d'un virement du lot (R-transaction) —
 *   règlement opposé, facture rouverte, lot PARTIALLY_RETURNED.
 * Règlements `purchasing_payments` réels (compte bancaire, rapprochement, lettrage), dans la
 * transaction du rapprochement ; annulation par règlement opposé, jamais de suppression.
 */
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { normalizeReference, openInLineCurrency, referenceTokens, registerReconciliationSource, type CandidateQuery, type ReconCandidate, type ReconciliationSource } from "@/core/reconciliation";
import { supplierAuxAccount } from "@/modules/sales/domain/fec";
import { fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import { invoiceStatusFromBalance } from "./domain/invoice";
import { purchasingSuppliers } from "./schema";
import { purchasingInvoices, purchasingPayments, purchasingSepaExportLines, purchasingSepaExports } from "./schema/extended";

type InvoiceRow = typeof purchasingInvoices.$inferSelect;
type SupplierRow = typeof purchasingSuppliers.$inferSelect;
const tenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));
const OPEN = ["ISSUED", "PARTIALLY_PAID"] as const;
const due = (row: Pick<InvoiceRow, "grossMinor" | "paidMinor" | "creditedMinor">) => row.grossMinor - row.paidMinor - row.creditedMinor;
const refundable = (row: Pick<InvoiceRow, "grossMinor" | "paidMinor" | "creditedMinor">) => row.paidMinor - Math.max(0, row.grossMinor - row.creditedMinor);
const invoiceNumber = sql`regexp_replace(upper(coalesce(${purchasingInvoices.number}, '') || ' ' || coalesce(${purchasingInvoices.supplierInvoiceNumber}, '')), '[^A-Z0-9 ]', '', 'g')`;

const suppliersOf = (ids: readonly string[]) =>
  ids.length === 0 ? Effect.succeed(new Map<string, SupplierRow>())
    : dbTry("purchasing.recon.suppliers", () => getDrizzle().select().from(purchasingSuppliers).where(inArray(purchasingSuppliers.id, [...new Set(ids)])))
      .pipe(Effect.map((rows) => new Map(rows.map((row) => [row.id, row]))));

const toCandidate = (row: InvoiceRow, supplier: SupplierRow | undefined, source: string, direction: "in" | "out", openMinor: number, query: CandidateQuery) =>
  openInLineCurrency({ openMinor, documentCurrency: row.currency, baseRate: row.exchangeRate, lineCurrency: query.line.currency }).pipe(
    Effect.map((lineOpen): ReconCandidate | null => lineOpen === null || lineOpen <= 0 ? null : {
      source, id: row.id, direction, openMinor: lineOpen, currency: query.line.currency,
      ...(row.currency !== query.line.currency ? { originalMinor: openMinor, originalCurrency: row.currency } : {}),
      date: row.dueDate ?? row.issueDate, references: [row.number ?? "", row.supplierInvoiceNumber ?? ""].filter(Boolean),
      counterpartyName: supplier?.sepaName ?? supplier?.name ?? null, counterpartyIbans: supplier?.iban ? [supplier.iban] : [],
      groupKey: row.supplierId, label: `${row.number ?? row.title} — ${supplier?.name ?? ""}`.trim(),
      baseRate: row.exchangeRate, documentOpenMinor: openMinor, documentCurrency: row.currency,
    }),
  );

const findInvoices = (query: CandidateQuery, scope: SQL, openExpr: SQL) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const base = and(tenant(purchasingInvoices.organizationId, query.organizationId), eq(purchasingInvoices.kind, "invoice"), scope)!;
    if (query.ids?.length) return yield* dbTry("purchasing.recon.ids", () => db.select().from(purchasingInvoices).where(and(base, inArray(purchasingInvoices.id, [...query.ids!]))).limit(query.limit));
    const search = query.search?.trim();
    if (search) {
      const like = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      return yield* dbTry("purchasing.recon.search", () => db.select().from(purchasingInvoices)
        .where(and(base, or(sql`${purchasingInvoices.number} ilike ${like}`, sql`${purchasingInvoices.supplierInvoiceNumber} ilike ${like}`, sql`${purchasingInvoices.title} ilike ${like}`)))
        .orderBy(desc(purchasingInvoices.issueDate)).limit(query.limit));
    }
    const tokens = referenceTokens(query.line);
    const cited = tokens.length ? yield* dbTry("purchasing.recon.cited", () => db.select().from(purchasingInvoices)
      .where(and(base, sql`string_to_array(${invoiceNumber}, ' ') && ${sql`array[${sql.join(tokens.map((t) => sql`${t}`), sql`, `)}]::text[]`}`)).limit(query.limit)) : [];
    const ibanSuppliers = query.line.counterpartyIban
      ? yield* dbTry("purchasing.recon.iban", () => db.select({ id: purchasingSuppliers.id }).from(purchasingSuppliers)
        .where(and(tenant(purchasingSuppliers.organizationId, query.organizationId), sql`upper(replace(${purchasingSuppliers.iban}, ' ', '')) = ${query.line.counterpartyIban!.replace(/\s+/g, "").toUpperCase()}`)).limit(5))
      : [];
    const byIban = ibanSuppliers.length ? yield* dbTry("purchasing.recon.byIban", () => db.select().from(purchasingInvoices)
      .where(and(base, inArray(purchasingInvoices.supplierId, ibanSuppliers.map((s) => s.id)))).limit(query.limit)) : [];
    const target = Math.abs(query.line.amountMinor);
    const near = yield* dbTry("purchasing.recon.near", () => db.select().from(purchasingInvoices).where(base)
      .orderBy(sql`abs((${openExpr}) - ${target})`, desc(purchasingInvoices.issueDate)).limit(query.limit));
    const seen = new Set<string>();
    return [...cited, ...byIban, ...near].filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
  });

const lockInvoice = (tx: DbTransaction, id: string, organizationId: string | null) =>
  Effect.gen(function* () {
    const [row] = yield* dbTry("purchasing.recon.lock", () => tx.select().from(purchasingInvoices)
      .where(and(eq(purchasingInvoices.id, id), tenant(purchasingInvoices.organizationId, organizationId))).limit(1).for("update"));
    if (!row) return yield* fail("NOT_FOUND", "Facture fournisseur introuvable.");
    return row;
  });

/** Écrit un règlement (signé) sur une facture verrouillée et recalcule son statut ; lettrage si soldée. */
const pay = (tx: DbTransaction, invoice: InvoiceRow, input: {
  readonly signedMinor: number; readonly paidAt: string; readonly reference: string; readonly bankAccountId: string; readonly reconciliationId: string;
  readonly actorId: string | null; readonly letteringCode: string | null; readonly sepaExportId?: string | null;
}) =>
  Effect.gen(function* () {
    const [payment] = yield* dbTry("purchasing.recon.payment", () => tx.insert(purchasingPayments).values({
      invoiceId: invoice.id, organizationId: invoice.organizationId, amountMinor: input.signedMinor, currency: invoice.currency, method: "bank_transfer",
      paidAt: input.paidAt, reference: input.reference.slice(0, 140), sepaExportId: input.sepaExportId ?? null, bankAccountId: input.bankAccountId,
      reconciliationId: input.reconciliationId, letteringCode: input.letteringCode, letteringDate: input.letteringCode ? input.paidAt : null, createdBy: input.actorId,
    }).returning());
    if (input.letteringCode) {
      yield* dbTry("purchasing.recon.letterDoc", () => tx.update(purchasingInvoices).set({ letteringCode: input.letteringCode, letteringDate: input.paidAt }).where(eq(purchasingInvoices.id, invoice.id)));
      yield* dbTry("purchasing.recon.letterPayments", () => tx.update(purchasingPayments).set({ letteringCode: input.letteringCode, letteringDate: input.paidAt })
        .where(and(eq(purchasingPayments.invoiceId, invoice.id), isNull(purchasingPayments.letteringCode))));
    }
    const paidMinor = invoice.paidMinor + input.signedMinor;
    const status = invoiceStatusFromBalance({ grossMinor: invoice.grossMinor, paidMinor, creditedMinor: invoice.creditedMinor });
    yield* dbTry("purchasing.recon.balance", () => tx.update(purchasingInvoices).set({ paidMinor, status }).where(eq(purchasingInvoices.id, invoice.id)));
    return payment!;
  });

const auxOf = (tx: DbTransaction, supplierId: string) =>
  dbTry("purchasing.recon.supplier", () => tx.select().from(purchasingSuppliers).where(eq(purchasingSuppliers.id, supplierId)).limit(1))
    .pipe(Effect.map(([supplier]) => (supplier ? { account: supplierAuxAccount(supplier.name, supplier.vatNumber), label: supplier.name } : null)));

const reversePurchasingPayments: ReconciliationSource["reverse"] = (tx, input) =>
  Effect.gen(function* () {
    const ids = input.effects.filter((effect) => effect.table === "purchasing_payments").map((effect) => effect.id);
    const payments = ids.length ? yield* dbTry("purchasing.recon.reverse.payments", () => tx.select().from(purchasingPayments).where(inArray(purchasingPayments.id, ids))) : [];
    for (const payment of payments) {
      const [invoice] = yield* dbTry("purchasing.recon.reverse.lock", () => tx.select().from(purchasingInvoices).where(eq(purchasingInvoices.id, payment.invoiceId)).limit(1).for("update"));
      if (!invoice) continue;
      yield* dbTry("purchasing.recon.reverse.unletter", () => tx.update(purchasingPayments).set({ letteringCode: null, letteringDate: null }).where(eq(purchasingPayments.id, payment.id)));
      yield* dbTry("purchasing.recon.reverse.unletterDoc", () => tx.update(purchasingInvoices).set({ letteringCode: null, letteringDate: null }).where(eq(purchasingInvoices.id, invoice.id)));
      yield* pay(tx, invoice, {
        signedMinor: -payment.amountMinor, paidAt: input.date, reference: `Annulation ${payment.reference ?? ""}`.trim(), bankAccountId: payment.bankAccountId ?? "",
        reconciliationId: input.reconciliationId, actorId: input.actorId, letteringCode: null, sepaExportId: payment.sepaExportId,
      });
    }
    // Lots SEPA et ordres : retour à l'état antérieur.
    for (const effect of input.effects) {
      if (effect.table === "purchasing_sepa_exports") {
        yield* dbTry("purchasing.recon.reverse.sepa", () => tx.update(purchasingSepaExports).set({ status: "EXPORTED", executedAt: null }).where(eq(purchasingSepaExports.id, effect.id)));
      } else if (effect.table === "purchasing_sepa_export_lines:executed") {
        yield* dbTry("purchasing.recon.reverse.sepaLine", () => tx.update(purchasingSepaExportLines).set({ status: "pending", paymentId: null }).where(eq(purchasingSepaExportLines.id, effect.id)));
      } else if (effect.table === "purchasing_sepa_export_lines:returned") {
        yield* dbTry("purchasing.recon.reverse.sepaReturn", () => tx.update(purchasingSepaExportLines).set({ status: "executed", returnReason: null }).where(eq(purchasingSepaExportLines.id, effect.id)));
        const [line] = yield* dbTry("purchasing.recon.reverse.sepaReturn.line", () => tx.select().from(purchasingSepaExportLines).where(eq(purchasingSepaExportLines.id, effect.id)).limit(1));
        if (line) {
          const [left] = yield* dbTry("purchasing.recon.reverse.sepaReturn.left", () => tx.select({ n: sql<number>`count(*)::int` }).from(purchasingSepaExportLines)
            .where(and(eq(purchasingSepaExportLines.exportId, line.exportId), eq(purchasingSepaExportLines.status, "returned"))));
          if ((left?.n ?? 0) === 0) yield* dbTry("purchasing.recon.reverse.sepaReturn.export", () => tx.update(purchasingSepaExports).set({ status: "EXECUTED" }).where(eq(purchasingSepaExports.id, line.exportId)));
        }
      }
    }
  });

export const purchasingInvoiceSource: ReconciliationSource = {
  key: "purchasing-invoice",
  direction: "out",
  findCandidates: (query) =>
    Effect.gen(function* () {
      if (query.line.amountMinor >= 0) return [];
      const rows = yield* findInvoices(query, inArray(purchasingInvoices.status, [...OPEN]), sql`${purchasingInvoices.grossMinor} - ${purchasingInvoices.paidMinor} - ${purchasingInvoices.creditedMinor}`);
      const suppliers = yield* suppliersOf(rows.map((row) => row.supplierId));
      const out: ReconCandidate[] = [];
      for (const row of rows) {
        if (!(OPEN as readonly string[]).includes(row.status) || due(row) <= 0) continue;
        const candidate = yield* toCandidate(row, suppliers.get(row.supplierId), "purchasing-invoice", "out", due(row), query);
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
      const payment = yield* pay(tx, invoice, { signedMinor: input.amountMinor, paidAt: input.paidAt, reference: input.reference, bankAccountId: input.bankAccountId, reconciliationId: input.reconciliationId, actorId: input.actorId, letteringCode: code });
      return { paymentId: payment.id, settled, documentNumber: invoice.number ?? invoice.id, effects: [{ table: "purchasing_payments", id: payment.id }], aux: yield* auxOf(tx, invoice.supplierId) };
    }),
  reverse: reversePurchasingPayments,
};

export const purchasingRefundSource: ReconciliationSource = {
  key: "purchasing-refund",
  direction: "in",
  findCandidates: (query) =>
    Effect.gen(function* () {
      if (query.line.amountMinor <= 0) return [];
      const rows = yield* findInvoices(query, sql`${purchasingInvoices.paidMinor} > greatest(0, ${purchasingInvoices.grossMinor} - ${purchasingInvoices.creditedMinor})`, sql`${purchasingInvoices.paidMinor} - greatest(0, ${purchasingInvoices.grossMinor} - ${purchasingInvoices.creditedMinor})`);
      const suppliers = yield* suppliersOf(rows.map((row) => row.supplierId));
      const out: ReconCandidate[] = [];
      for (const row of rows) {
        const open = refundable(row);
        if (open <= 0) continue;
        const candidate = yield* toCandidate(row, suppliers.get(row.supplierId), "purchasing-refund", "in", open, query);
        if (candidate) out.push({ ...candidate, label: `Remboursement ${candidate.label}` });
      }
      return out;
    }),
  apply: (tx, input) =>
    Effect.gen(function* () {
      const invoice = yield* lockInvoice(tx, input.candidateId, input.organizationId);
      const open = refundable(invoice);
      if (input.amountMinor <= 0 || input.amountMinor > open) return yield* fail("BAD_REQUEST", `Remboursement hors du trop payé de ${invoice.number ?? invoice.id}.`);
      const settled = input.amountMinor === open;
      const code = settled ? yield* input.lettering() : null;
      const payment = yield* pay(tx, invoice, { signedMinor: -input.amountMinor, paidAt: input.paidAt, reference: input.reference, bankAccountId: input.bankAccountId, reconciliationId: input.reconciliationId, actorId: input.actorId, letteringCode: code });
      return { paymentId: payment.id, settled, documentNumber: invoice.number ?? invoice.id, effects: [{ table: "purchasing_payments", id: payment.id }], aux: yield* auxOf(tx, invoice.supplierId) };
    }),
  reverse: reversePurchasingPayments,
};

/** Références d'un lot : numéro (MsgId) et identifiant du bloc de paiement (`<numéro>-1`). */
const sepaReferences = (number: string) => {
  const clean = number.replace(/[^A-Za-z0-9_\-.:]/g, "");
  return [clean.slice(0, 35), `${clean.slice(0, 30)}-1`];
};

export const purchasingSepaSource: ReconciliationSource = {
  key: "purchasing-sepa",
  direction: "out",
  findCandidates: (query) =>
    Effect.gen(function* () {
      if (query.line.amountMinor >= 0 || query.line.currency !== "EUR") return [];
      const db = getDrizzle();
      const base = and(tenant(purchasingSepaExports.organizationId, query.organizationId), eq(purchasingSepaExports.status, "EXPORTED"))!;
      const where = query.ids?.length ? and(base, inArray(purchasingSepaExports.id, [...query.ids])) : query.search?.trim() ? and(base, sql`${purchasingSepaExports.number} ilike ${`%${query.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`}`) : base;
      const exports = yield* dbTry("purchasing.recon.sepa", () => db.select().from(purchasingSepaExports).where(where).orderBy(desc(purchasingSepaExports.createdAt)).limit(query.limit));
      if (exports.length === 0) return [];
      const lines = yield* dbTry("purchasing.recon.sepa.lines", () => db.select().from(purchasingSepaExportLines)
        .where(and(inArray(purchasingSepaExportLines.exportId, exports.map((row) => row.id)), eq(purchasingSepaExportLines.status, "pending"))));
      return exports.flatMap((row): ReconCandidate[] => {
        const own = lines.filter((line) => line.exportId === row.id);
        const open = own.reduce((sum, line) => sum + line.amountMinor, 0);
        if (open <= 0) return [];
        return [{
          source: "purchasing-sepa", id: row.id, direction: "out", openMinor: open, currency: "EUR", date: row.requestedExecutionDate,
          references: [...sepaReferences(row.number), ...own.map((line) => line.endToEndId)], counterpartyName: null, counterpartyIbans: [], groupKey: null,
          label: `Lot SEPA ${row.number} (${own.length})`, documentOpenMinor: open, documentCurrency: "EUR",
        }];
      });
    }),
  apply: (tx, input) =>
    Effect.gen(function* () {
      const [batch] = yield* dbTry("purchasing.recon.sepa.lock", () => tx.select().from(purchasingSepaExports)
        .where(and(eq(purchasingSepaExports.id, input.candidateId), tenant(purchasingSepaExports.organizationId, input.organizationId))).limit(1).for("update"));
      if (!batch) return yield* fail("NOT_FOUND", "Lot SEPA introuvable.");
      if (batch.status !== "EXPORTED") return yield* fail("BAD_REQUEST", `Lot ${batch.number} déjà exécuté.`);
      const lines = yield* dbTry("purchasing.recon.sepa.pending", () => tx.select().from(purchasingSepaExportLines)
        .where(and(eq(purchasingSepaExportLines.exportId, batch.id), eq(purchasingSepaExportLines.status, "pending"))));
      const open = lines.reduce((sum, line) => sum + line.amountMinor, 0);
      if (lines.length === 0 || input.amountMinor !== open) return yield* fail("BAD_REQUEST", `Le débit doit couvrir le lot ${batch.number} en entier (${open}).`);
      const effects: { table: string; id: string }[] = [];
      let allSettled = true;
      for (const line of lines) {
        const invoice = yield* lockInvoice(tx, line.invoiceId, input.organizationId);
        if (!(OPEN as readonly string[]).includes(invoice.status) || line.amountMinor > due(invoice)) {
          return yield* fail("BAD_REQUEST", `Facture ${invoice.number ?? invoice.id} déjà réglée autrement : rapprocher le lot à la main.`);
        }
        const settled = line.amountMinor === due(invoice);
        allSettled &&= settled;
        const code = settled ? yield* input.lettering() : null;
        const payment = yield* pay(tx, invoice, { signedMinor: line.amountMinor, paidAt: input.paidAt, reference: line.endToEndId, bankAccountId: input.bankAccountId, reconciliationId: input.reconciliationId, actorId: input.actorId, letteringCode: code, sepaExportId: batch.id });
        yield* dbTry("purchasing.recon.sepa.line", () => tx.update(purchasingSepaExportLines).set({ status: "executed", paymentId: payment.id }).where(eq(purchasingSepaExportLines.id, line.id)));
        effects.push({ table: "purchasing_payments", id: payment.id }, { table: "purchasing_sepa_export_lines:executed", id: line.id });
      }
      yield* dbTry("purchasing.recon.sepa.executed", () => tx.update(purchasingSepaExports).set({ status: "EXECUTED", executedAt: new Date(), bankAccountId: input.bankAccountId }).where(eq(purchasingSepaExports.id, batch.id)));
      effects.push({ table: "purchasing_sepa_exports", id: batch.id });
      return { paymentId: null, settled: allSettled, documentNumber: batch.number, effects, aux: null };
    }),
  reverse: reversePurchasingPayments,
};

export const purchasingSepaReturnSource: ReconciliationSource = {
  key: "purchasing-sepa-return",
  direction: "in",
  findCandidates: (query) =>
    Effect.gen(function* () {
      if (query.line.amountMinor <= 0 || query.line.currency !== "EUR") return [];
      const tokens = [...new Set([...query.line.references, ...referenceTokens(query.line)].map(normalizeReference).filter(Boolean))];
      const base = and(tenant(purchasingSepaExportLines.organizationId, query.organizationId), eq(purchasingSepaExportLines.status, "executed"))!;
      const where = query.ids?.length ? and(base, inArray(purchasingSepaExportLines.id, [...query.ids]))
        : query.search?.trim() ? and(base, sql`${purchasingSepaExportLines.endToEndId} ilike ${`%${query.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`}`)
        : tokens.length ? and(base, inArray(sql`regexp_replace(upper(${purchasingSepaExportLines.endToEndId}), '[^A-Z0-9]', '', 'g')`, tokens))
        : null;
      if (!where) return [];
      const lines = yield* dbTry("purchasing.recon.sepaReturn", () => getDrizzle().select({ line: purchasingSepaExportLines, number: purchasingSepaExports.number })
        .from(purchasingSepaExportLines).innerJoin(purchasingSepaExports, eq(purchasingSepaExports.id, purchasingSepaExportLines.exportId)).where(where).limit(query.limit));
      return lines.map(({ line, number }): ReconCandidate => ({
        source: "purchasing-sepa-return", id: line.id, direction: "in", openMinor: line.amountMinor, currency: "EUR", date: null,
        references: [line.endToEndId], counterpartyName: null, counterpartyIbans: [], groupKey: line.exportId,
        label: `Retour ${line.endToEndId} (lot ${number})`, documentOpenMinor: line.amountMinor, documentCurrency: "EUR",
      }));
    }),
  apply: (tx, input) =>
    Effect.gen(function* () {
      const [line] = yield* dbTry("purchasing.recon.sepaReturn.lock", () => tx.select().from(purchasingSepaExportLines)
        .where(and(eq(purchasingSepaExportLines.id, input.candidateId), tenant(purchasingSepaExportLines.organizationId, input.organizationId))).limit(1).for("update"));
      if (!line || line.status !== "executed") return yield* fail("BAD_REQUEST", "Ordre SEPA non exécuté ou déjà retourné.");
      if (input.amountMinor !== line.amountMinor) return yield* fail("BAD_REQUEST", `Le retour doit porter sur le montant de l'ordre (${line.amountMinor}).`);
      const invoice = yield* lockInvoice(tx, line.invoiceId, input.organizationId);
      yield* dbTry("purchasing.recon.sepaReturn.unletter", () => tx.update(purchasingInvoices).set({ letteringCode: null, letteringDate: null }).where(eq(purchasingInvoices.id, invoice.id)));
      if (line.paymentId) yield* dbTry("purchasing.recon.sepaReturn.unletterPayment", () => tx.update(purchasingPayments).set({ letteringCode: null, letteringDate: null }).where(eq(purchasingPayments.id, line.paymentId!)));
      const payment = yield* pay(tx, invoice, { signedMinor: -line.amountMinor, paidAt: input.paidAt, reference: `Retour ${line.endToEndId}${input.returnReason ? ` ${input.returnReason}` : ""}`, bankAccountId: input.bankAccountId, reconciliationId: input.reconciliationId, actorId: input.actorId, letteringCode: null, sepaExportId: line.exportId });
      yield* dbTry("purchasing.recon.sepaReturn.line", () => tx.update(purchasingSepaExportLines).set({ status: "returned", returnReason: input.returnReason ?? null }).where(eq(purchasingSepaExportLines.id, line.id)));
      yield* dbTry("purchasing.recon.sepaReturn.export", () => tx.update(purchasingSepaExports).set({ status: "PARTIALLY_RETURNED" }).where(eq(purchasingSepaExports.id, line.exportId)));
      return {
        paymentId: payment.id, settled: true, documentNumber: line.endToEndId,
        effects: [{ table: "purchasing_payments", id: payment.id }, { table: "purchasing_sepa_export_lines:returned", id: line.id }], aux: yield* auxOf(tx, invoice.supplierId),
      };
    }),
  reverse: reversePurchasingPayments,
};

/** Idempotent : appelé au démarrage (bootstrap). */
export const registerPurchasingReconciliation = (): void => {
  for (const source of [purchasingInvoiceSource, purchasingRefundSource, purchasingSepaSource, purchasingSepaReturnSource]) registerReconciliationSource(source);
};
