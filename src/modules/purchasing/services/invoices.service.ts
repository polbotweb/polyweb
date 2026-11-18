/**
 * Factures et avoirs fournisseurs : brouillon, rapprochement (2/3 voies selon réglages),
 * émission numérotée, règlements, écriture d'achat `buildPurchaseEntry`.
 */
import { Effect } from "effect";
import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/action";
import { assignDocumentNumber } from "@/core/numbering";
import { computeTaxTotals, fromDecimal, money, parseCurrency, type CurrencyCode } from "@/core/money";
import { purchasing, purchasingOrderLines, purchasingReceiptLines, purchasingReceipts, purchasingSuppliers } from "../schema";
import { purchasingInvoiceLines, purchasingInvoiceRevisions, purchasingInvoices, purchasingPayments } from "../schema/extended";
import { purchasingSettingsService } from "./settings.service";
import { invoiceAmountDue, invoiceStatusFromBalance, OPEN_INVOICE_STATUSES, type SupplierInvoiceKind } from "../domain/invoice";
import { validateSupplierPayment } from "../domain/payments";
import { assertIssuable, matchDocument, type MatchLineInput } from "../domain/matching";
import {
  DEFAULT_SUPPLIER_CREDIT_NUMBERING, DEFAULT_SUPPLIER_INVOICE_NUMBERING, SUPPLIER_CREDIT_NUMBERING_KEY, SUPPLIER_INVOICE_NUMBERING_KEY, schemeWithPrefix,
} from "../domain/numbering";
import { purchasingToday } from "./purchasing.service";

type Executor = ReturnType<typeof getDrizzle> | DbTransaction;
const sameTenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));

export type SupplierInvoiceRow = typeof purchasingInvoices.$inferSelect;

export interface InvoiceLineInput {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly ratePercent?: string;
  readonly kind?: "stock" | "service";
  readonly sku?: string | null;
  readonly itemId?: string | null;
  readonly orderLineId?: string | null;
  readonly receiptLineId?: string | null;
  readonly accepted?: boolean;
}

export interface InvoiceInput {
  readonly organizationId: string | null;
  readonly kind?: SupplierInvoiceKind;
  readonly title?: string | null;
  readonly supplierId: string;
  readonly orderId?: string | null;
  readonly sourceInvoiceId?: string | null;
  readonly supplierInvoiceNumber?: string | null;
  readonly currency: string;
  readonly paymentTermDays?: number;
  readonly notes?: string | null;
  readonly lines: readonly InvoiceLineInput[];
}

const slugify = (title: string) =>
  title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "facture";

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const findInvoice = (executor: Executor, id: string, forUpdate = false) =>
  dbTry("purchasing.invoice.find", () => {
    const query = executor.select().from(purchasingInvoices).where(eq(purchasingInvoices.id, id)).limit(1);
    return forUpdate ? query.for("update") : query;
  }).pipe(Effect.flatMap((rows) => (rows[0] ? Effect.succeed(rows[0]) : fail("NOT_FOUND", "Facture fournisseur introuvable."))));

const invoiceLinesOf = (executor: Executor, invoiceId: string) =>
  dbTry("purchasing.invoice.lines", () =>
    executor.select().from(purchasingInvoiceLines).where(eq(purchasingInvoiceLines.invoiceId, invoiceId)).orderBy(asc(purchasingInvoiceLines.position)));

const revision = (executor: Executor, row: SupplierInvoiceRow, authorId: string, note: string) =>
  dbTry("purchasing.invoice.revision", () =>
    executor.insert(purchasingInvoiceRevisions).values({ resourceId: row.id, authorId, title: row.title, slug: row.slug, status: row.status, note }));

const prepareLines = (input: InvoiceInput) =>
  Effect.gen(function* () {
    if (input.lines.length === 0) return yield* fail("BAD_REQUEST", "Une facture doit avoir au moins une ligne.");
    const currency = yield* parseCurrency(input.currency).pipe(Effect.catch(() => fail("BAD_REQUEST", "Devise invalide.")));
    const prepared = [];
    for (const [index, line] of input.lines.entries()) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) return yield* fail("BAD_REQUEST", "Quantité invalide.");
      const unit = yield* fromDecimal(line.unitPrice.trim().replace(",", "."), currency, "half-up").pipe(
        Effect.catch(() => fail("BAD_REQUEST", "Prix unitaire invalide.")),
      );
      const net = yield* money(unit.amountMinor * line.quantity, currency).pipe(Effect.catch(() => fail("BAD_REQUEST", "Montant de ligne invalide.")));
      prepared.push({
        position: index + 1,
        kind: line.kind ?? "stock",
        itemId: line.itemId ?? null,
        sku: line.sku ?? null,
        description: line.description.trim() || null,
        quantity: line.quantity,
        unitPriceMinor: unit.amountMinor,
        taxCategory: "standard",
        ratePercent: (line.ratePercent ?? "20").trim().replace(",", "."),
        net: net,
        orderLineId: line.orderLineId ?? null,
        receiptLineId: line.receiptLineId ?? null,
        accepted: line.accepted ?? false,
      });
    }
    const totals = yield* computeTaxTotals(prepared.map((line) => ({ net: line.net, ratePercent: line.ratePercent })), { currency, strategy: "per-line" }).pipe(
      Effect.catch(() => fail("BAD_REQUEST", "Totaux de taxe invalides.")),
    );
    return {
      currency,
      totals,
      lines: prepared.map((line, index) => ({
        position: line.position,
        kind: line.kind,
        itemId: line.itemId,
        sku: line.sku,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        taxCategory: line.taxCategory,
        ratePercent: line.ratePercent,
        netMinor: line.net.amountMinor,
        taxMinor: totals.byRate.find((rate) => rate.ratePercent === line.ratePercent) && 0,
        orderLineId: line.orderLineId,
        receiptLineId: line.receiptLineId,
        accepted: line.accepted,
        net: line.net,
        index,
      })),
    };
  });

const lineTaxes = (lines: readonly { net: { amountMinor: number }; ratePercent: string }[], totals: { byRate: readonly { ratePercent: string; tax: { amountMinor: number }; base: { amountMinor: number } }[] }) => {
  const remaining = new Map(totals.byRate.map((rate) => [rate.ratePercent, rate.tax.amountMinor]));
  return lines.map((line, index) => {
    const group = totals.byRate.find((rate) => rate.ratePercent === line.ratePercent);
    const left = remaining.get(line.ratePercent) ?? 0;
    const isLast = lines.slice(index + 1).every((other) => other.ratePercent !== line.ratePercent);
    if (!group || group.base.amountMinor === 0) return 0;
    const share = isLast ? left : Math.round((line.net.amountMinor / group.base.amountMinor) * group.tax.amountMinor);
    remaining.set(line.ratePercent, left - share);
    return share;
  });
};

const writeLines = (tx: DbTransaction, invoiceId: string, lines: readonly (InvoiceLineInput & { position: number; unitPriceMinor: number; netMinor: number; taxMinor: number; ratePercent: string })[]) =>
  Effect.gen(function* () {
    yield* dbTry("purchasing.invoice.lines.clear", () => tx.delete(purchasingInvoiceLines).where(eq(purchasingInvoiceLines.invoiceId, invoiceId)));
    if (lines.length) {
      yield* dbTry("purchasing.invoice.lines.insert", () => tx.insert(purchasingInvoiceLines).values(lines.map((line) => ({
        invoiceId,
        position: line.position,
        kind: line.kind ?? "stock",
        itemId: line.itemId ?? null,
        sku: line.sku ?? null,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        taxCategory: "standard",
        ratePercent: line.ratePercent,
        netMinor: line.netMinor,
        taxMinor: line.taxMinor,
        orderLineId: line.orderLineId ?? null,
        receiptLineId: line.receiptLineId ?? null,
        accepted: line.accepted ?? false,
      }))));
    }
  });

const computePrepared = (input: InvoiceInput) =>
  Effect.gen(function* () {
    const prepared = yield* prepareLines(input);
    const taxes = lineTaxes(prepared.lines, prepared.totals);
    const lines = prepared.lines.map((line, index) => ({
      position: line.position,
      kind: line.kind,
      itemId: line.itemId,
      sku: line.sku,
      description: line.description ?? "",
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      ratePercent: line.ratePercent,
      netMinor: line.netMinor,
      taxMinor: taxes[index] ?? 0,
      orderLineId: line.orderLineId,
      receiptLineId: line.receiptLineId,
      accepted: line.accepted,
      unitPrice: input.lines[index]!.unitPrice,
    }));
    return {
      currency: prepared.currency,
      netMinor: prepared.totals.net.amountMinor,
      taxMinor: prepared.totals.tax.amountMinor,
      grossMinor: prepared.totals.gross.amountMinor,
      lines,
    };
  });

const matchInputsFor = (executor: Executor, organizationId: string | null, lines: readonly typeof purchasingInvoiceLines.$inferSelect[]) =>
  Effect.gen(function* () {
    const orderLineIds = lines.map((line) => line.orderLineId).filter((id): id is string => Boolean(id));
    const orderLines = orderLineIds.length === 0 ? [] : yield* dbTry("purchasing.invoice.orderLines", () =>
      executor.select().from(purchasingOrderLines).where(inArray(purchasingOrderLines.id, orderLineIds)));
    const byOrderLine = new Map(orderLines.map((line) => [line.id, line]));
    const receiptByOrderLine = new Map<string, number>();
    if (orderLineIds.length) {
      const receipts = yield* dbTry("purchasing.invoice.receiptQty", () =>
        executor.select({
          orderLineId: purchasingReceiptLines.orderLineId,
          quantity: sql<number>`coalesce(sum(${purchasingReceiptLines.quantity}), 0)`.mapWith(Number),
        }).from(purchasingReceiptLines)
          .innerJoin(purchasingReceipts, eq(purchasingReceipts.id, purchasingReceiptLines.receiptId))
          .where(and(inArray(purchasingReceiptLines.orderLineId, orderLineIds), sameTenant(purchasingReceipts.organizationId, organizationId)))
          .groupBy(purchasingReceiptLines.orderLineId));
      for (const row of receipts) if (row.orderLineId) receiptByOrderLine.set(row.orderLineId, row.quantity);
    }
    const inputs: MatchLineInput[] = lines.map((line) => {
      const orderLine = line.orderLineId ? byOrderLine.get(line.orderLineId) : undefined;
      return {
        id: line.id,
        orderedQuantity: orderLine?.quantity ?? 0,
        receivedQuantity: line.orderLineId ? (receiptByOrderLine.get(line.orderLineId) ?? 0) : 0,
        invoicedQuantity: line.quantity,
        orderedUnitPriceMinor: orderLine?.unitPriceMinor ?? line.unitPriceMinor,
        invoicedUnitPriceMinor: line.unitPriceMinor,
      };
    });
    return inputs;
  });

export const purchasingInvoicesService = {
  get: (id: string) =>
    Effect.gen(function* () {
      const invoice = yield* findInvoice(getDrizzle(), id);
      const lines = yield* invoiceLinesOf(getDrizzle(), id);
      return { invoice, lines };
    }),

  create: (input: InvoiceInput, authorId: string) =>
    Effect.gen(function* () {
      const [supplier] = yield* dbTry("purchasing.invoice.supplier", () =>
        getDrizzle().select().from(purchasingSuppliers).where(and(eq(purchasingSuppliers.id, input.supplierId), sameTenant(purchasingSuppliers.organizationId, input.organizationId))).limit(1));
      if (!supplier) return yield* fail("NOT_FOUND", "Fournisseur introuvable.");
      const computed = yield* computePrepared(input);
      const title = input.title?.trim() || input.supplierInvoiceNumber || supplier.name;
      return yield* dbTransaction("purchasing.invoice.create", (tx) =>
        Effect.gen(function* () {
          const [row] = yield* dbTry("purchasing.invoice.insert", () => tx.insert(purchasingInvoices).values({
            organizationId: input.organizationId,
            kind: input.kind ?? "invoice",
            slug: `${slugify(title)}-${crypto.randomUUID().slice(0, 8)}`,
            title,
            supplierId: input.supplierId,
            orderId: input.orderId ?? null,
            sourceInvoiceId: input.sourceInvoiceId ?? null,
            supplierInvoiceNumber: input.supplierInvoiceNumber ?? null,
            currency: computed.currency,
            paymentTermDays: input.paymentTermDays ?? 30,
            netMinor: computed.netMinor,
            taxMinor: computed.taxMinor,
            grossMinor: computed.grossMinor,
            notes: input.notes ?? null,
            createdBy: authorId,
          }).returning());
          yield* writeLines(tx, row!.id, computed.lines);
          yield* revision(tx, row!, authorId, "Création");
          return row!;
        }));
    }),

  update: (id: string, input: InvoiceInput, authorId: string) =>
    dbTransaction("purchasing.invoice.update", (tx) =>
      Effect.gen(function* () {
        const current = yield* findInvoice(tx, id, true);
        if (current.status !== "DRAFT") return yield* fail("BAD_REQUEST", "Facture non modifiable : seul un brouillon peut être modifié.");
        const computed = yield* computePrepared({ ...input, organizationId: current.organizationId, supplierId: input.supplierId || current.supplierId, currency: input.currency || current.currency });
        const title = input.title?.trim() || current.title;
        const [row] = yield* dbTry("purchasing.invoice.update", () => tx.update(purchasingInvoices).set({
          title,
          supplierId: input.supplierId,
          orderId: input.orderId ?? current.orderId,
          sourceInvoiceId: input.sourceInvoiceId ?? current.sourceInvoiceId,
          supplierInvoiceNumber: input.supplierInvoiceNumber ?? current.supplierInvoiceNumber,
          currency: computed.currency,
          paymentTermDays: input.paymentTermDays ?? current.paymentTermDays,
          netMinor: computed.netMinor,
          taxMinor: computed.taxMinor,
          grossMinor: computed.grossMinor,
          notes: input.notes ?? current.notes,
        }).where(eq(purchasingInvoices.id, id)).returning());
        yield* writeLines(tx, id, computed.lines);
        yield* revision(tx, row!, authorId, "Mise à jour");
        return row!;
      })),

  previewMatch: (id: string) =>
    Effect.gen(function* () {
      const invoice = yield* findInvoice(getDrizzle(), id);
      const lines = yield* invoiceLinesOf(getDrizzle(), id);
      const { settings } = yield* purchasingSettingsService.get(invoice.organizationId);
      const inputs = yield* matchInputsFor(getDrizzle(), invoice.organizationId, lines);
      const accepted = new Set(lines.filter((line) => line.accepted).map((line) => line.id));
      return matchDocument(inputs, settings.matchingMode, { absoluteMinor: settings.toleranceAbsoluteMinor, percent: settings.tolerancePercent }, settings.matchingPolicy, accepted);
    }),

  acceptVariances: (id: string, lineIds: readonly string[], authorId: string) =>
    dbTransaction("purchasing.invoice.accept", (tx) =>
      Effect.gen(function* () {
        const current = yield* findInvoice(tx, id, true);
        if (current.status !== "DRAFT") return yield* fail("BAD_REQUEST", "Seules les factures en brouillon acceptent un écart.");
        const { settings } = yield* purchasingSettingsService.get(current.organizationId);
        if (settings.matchingPolicy !== "allow_with_acceptance") return yield* fail("BAD_REQUEST", "La politique de rapprochement n'autorise pas l'acceptation des écarts.");
        if (lineIds.length) {
          yield* dbTry("purchasing.invoice.accept.lines", () =>
            tx.update(purchasingInvoiceLines).set({ accepted: true, matchStatus: "accepted" }).where(and(eq(purchasingInvoiceLines.invoiceId, id), inArray(purchasingInvoiceLines.id, [...lineIds]))));
        }
        yield* revision(tx, current, authorId, "Acceptation des écarts");
        return current;
      })),

  issue: (id: string, authorId: string, options: { readonly today?: string } = {}) =>
    dbTransaction("purchasing.invoice.issue", (tx) =>
      Effect.gen(function* () {
        const current = yield* findInvoice(tx, id, true);
        if (current.status !== "DRAFT") return yield* fail("BAD_REQUEST", "Seule une facture brouillon peut être émise.");
        const lines = yield* invoiceLinesOf(tx, id);
        const { settings } = yield* purchasingSettingsService.get(current.organizationId);
        const inputs = yield* matchInputsFor(tx, current.organizationId, lines);
        const accepted = new Set(lines.filter((line) => line.accepted).map((line) => line.id));
        const match = matchDocument(inputs, settings.matchingMode, { absoluteMinor: settings.toleranceAbsoluteMinor, percent: settings.tolerancePercent }, settings.matchingPolicy, accepted);
        yield* assertIssuable(match).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
        const today = options.today ?? purchasingToday();
        const key = current.kind === "credit_note" ? SUPPLIER_CREDIT_NUMBERING_KEY : SUPPLIER_INVOICE_NUMBERING_KEY;
        const scheme = schemeWithPrefix(current.kind === "credit_note" ? DEFAULT_SUPPLIER_CREDIT_NUMBERING : DEFAULT_SUPPLIER_INVOICE_NUMBERING, current.kind === "credit_note" ? settings.creditPrefix : settings.invoicePrefix);
        const { number } = yield* assignDocumentNumber(tx, { organizationId: current.organizationId, key, scheme, date: today }).pipe(
          Effect.catch((error) => fail("BAD_REQUEST", error.message)),
        );
        for (const line of match.lines) {
          yield* dbTry("purchasing.invoice.match.line", () =>
            tx.update(purchasingInvoiceLines).set({ matchStatus: line.status }).where(eq(purchasingInvoiceLines.id, line.id)));
        }
        const [row] = yield* dbTry("purchasing.invoice.issue", () => tx.update(purchasingInvoices).set({
          status: "ISSUED",
          number,
          issueDate: today,
          dueDate: addDays(today, current.paymentTermDays),
          matchStatus: match.status,
        }).where(eq(purchasingInvoices.id, id)).returning());
        if (current.kind === "credit_note" && current.sourceInvoiceId) {
          const source = yield* findInvoice(tx, current.sourceInvoiceId, true);
          const creditedMinor = source.creditedMinor + current.grossMinor;
          const status = invoiceStatusFromBalance({ grossMinor: source.grossMinor, paidMinor: source.paidMinor, creditedMinor });
          yield* dbTry("purchasing.invoice.source.credit", () =>
            tx.update(purchasingInvoices).set({ creditedMinor, status }).where(eq(purchasingInvoices.id, source.id)));
        }
        yield* revision(tx, row!, authorId, "Émission");
        return row!;
      })),

  recordPayment: (id: string, input: { readonly amountMinor: number; readonly method: string; readonly paidAt?: string; readonly reference?: string | null }, authorId: string) =>
    dbTransaction("purchasing.invoice.pay", (tx) =>
      Effect.gen(function* () {
        const current = yield* findInvoice(tx, id, true);
        const valid = yield* validateSupplierPayment(current.status, current, input.amountMinor, input.method).pipe(
          Effect.catch((error) => fail("BAD_REQUEST", error.message)),
        );
        const paidAt = input.paidAt ?? purchasingToday();
        const [payment] = yield* dbTry("purchasing.payment.insert", () => tx.insert(purchasingPayments).values({
          invoiceId: id,
          organizationId: current.organizationId,
          amountMinor: valid.amountMinor,
          currency: current.currency,
          method: valid.method,
          paidAt,
          reference: input.reference ?? null,
          createdBy: authorId,
        }).returning());
        const paidMinor = current.paidMinor + valid.amountMinor;
        const status = invoiceStatusFromBalance({ grossMinor: current.grossMinor, paidMinor, creditedMinor: current.creditedMinor });
        const [row] = yield* dbTry("purchasing.invoice.paid", () =>
          tx.update(purchasingInvoices).set({ paidMinor, status }).where(eq(purchasingInvoices.id, id)).returning());
        yield* revision(tx, row!, authorId, "Règlement");
        return { invoice: row!, payment: payment! };
      })),

  cancel: (id: string, authorId: string) =>
    dbTransaction("purchasing.invoice.cancel", (tx) =>
      Effect.gen(function* () {
        const current = yield* findInvoice(tx, id, true);
        if (!["DRAFT", "ISSUED"].includes(current.status) || current.paidMinor > 0) {
          return yield* fail("BAD_REQUEST", "Cette facture ne peut pas être annulée.");
        }
        const [row] = yield* dbTry("purchasing.invoice.cancel", () =>
          tx.update(purchasingInvoices).set({ status: "CANCELLED" }).where(eq(purchasingInvoices.id, id)).returning());
        yield* revision(tx, row!, authorId, "Annulation");
        return row!;
      })),
};

export { invoiceAmountDue, OPEN_INVOICE_STATUSES };
