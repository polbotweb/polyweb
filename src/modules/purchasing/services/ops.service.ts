/**
 * Opérations achats : retours fournisseur + CQ, frais d'approche, export SEPA pain.001,
 * import de facture électronique, réassort, sessions punch-out.
 */
import { createHash } from "node:crypto";
import { Effect } from "effect";
import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/action";
import { assignDocumentNumber } from "@/core/numbering";
import { privateStorage } from "@/lib/storage/private";
import { extractEmbeddedInvoiceXml, parseIncomingInvoiceXml } from "@/core/einvoice";
import { renderPain001 } from "@/core/sepa";
import { logisticsItems, logisticsStockMovements, logisticsWarehouses } from "@/modules/logistics/schema";
import { logisticsStockPort } from "@/modules/logistics/services/logistics.service";
import { purchasing, purchasingOrderLines, purchasingReceiptLines, purchasingReceipts, purchasingSuppliers } from "../schema";
import {
  purchasingEinvoiceImports, purchasingInvoices, purchasingLandedCostLines, purchasingLandedCosts,
  purchasingPunchoutSessions, purchasingQualityCheckLines, purchasingQualityChecks,
  purchasingReorderRules, purchasingReorderSuggestions, purchasingReturnLines, purchasingReturns, purchasingSepaExports,
} from "../schema/extended";
import { canTransitionReturn, planSupplierReturn, qualityResultOf, returnAffectsStock, type ReturnReason } from "../domain/returns";
import { allocateLandedCost, type LandedCostCategory, type LandedCostMethod } from "../domain/landed-costs";
import { parsePunchOutOrderMessage, punchOutMac, renderPunchOutSetupRequest, type PunchOutIdentity } from "../domain/punchout";
import { reorderAction, suggestReorder, validateReorderRule, type ReorderRuleInput } from "../domain/reorder";
import { canAutoSend } from "../domain/settings";
import {
  DEFAULT_SEPA_EXPORT_NUMBERING, DEFAULT_SUPPLIER_RETURN_NUMBERING, SEPA_EXPORT_NUMBERING_KEY, SUPPLIER_RETURN_NUMBERING_KEY, schemeWithPrefix,
} from "../domain/numbering";
import { purchasingSettingsService } from "./settings.service";
import { purchasingInvoicesService } from "./invoices.service";
import { purchasingService, purchasingToday } from "./purchasing.service";

type Executor = ReturnType<typeof getDrizzle> | DbTransaction;
const sameTenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const slugify = (title: string) =>
  title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "retour";

const findReturn = (executor: Executor, id: string, forUpdate = false) =>
  dbTry("purchasing.return.find", () => {
    const query = executor.select().from(purchasingReturns).where(eq(purchasingReturns.id, id)).limit(1);
    return forUpdate ? query.for("update") : query;
  }).pipe(Effect.flatMap((rows) => (rows[0] ? Effect.succeed(rows[0]) : fail("NOT_FOUND", "Retour fournisseur introuvable."))));

export const purchasingOpsService = {
  createReturn: (input: {
    readonly organizationId: string | null; readonly supplierId: string; readonly warehouseId: string;
    readonly orderId?: string | null; readonly invoiceId?: string | null; readonly reason: ReturnReason; readonly title?: string | null; readonly notes?: string | null;
    readonly lines: readonly { readonly sku: string; readonly quantity: number; readonly itemId?: string | null; readonly receiptLineId?: string | null; readonly reason?: ReturnReason }[];
  }, authorId: string) =>
    Effect.gen(function* () {
      const plan = yield* planSupplierReturn(input.lines.map((line) => ({
        receiptLineId: line.receiptLineId ?? "",
        itemId: line.itemId ?? null,
        sku: line.sku,
        quantity: line.quantity,
        receivedQuantity: line.quantity,
        alreadyReturned: 0,
        kind: "stock" as const,
      }))).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      const title = input.title?.trim() || `Retour ${purchasingToday()}`;
      return yield* dbTransaction("purchasing.return.create", (tx) =>
        Effect.gen(function* () {
          const [row] = yield* dbTry("purchasing.return.insert", () => tx.insert(purchasingReturns).values({
            organizationId: input.organizationId, slug: `${slugify(title)}-${crypto.randomUUID().slice(0, 8)}`, title,
            supplierId: input.supplierId, warehouseId: input.warehouseId, orderId: input.orderId ?? null, invoiceId: input.invoiceId ?? null,
            reason: input.reason, notes: input.notes ?? null, createdBy: authorId,
          }).returning());
          yield* dbTry("purchasing.return.lines", () => tx.insert(purchasingReturnLines).values(plan.map((line, index) => ({
            returnId: row!.id, sku: line.sku, quantity: line.quantity, itemId: input.lines[index]?.itemId ?? null,
            receiptLineId: input.lines[index]?.receiptLineId ?? null, reason: input.lines[index]?.reason ?? input.reason,
          }))));
          return row!;
        }));
    }),

  transitionReturn: (id: string, to: "AUTHORIZED" | "SHIPPED" | "RECEIVED_BY_SUPPLIER" | "CREDITED" | "CANCELLED", authorId: string) =>
    dbTransaction("purchasing.return.transition", (tx) =>
      Effect.gen(function* () {
        const current = yield* findReturn(tx, id, true);
        if (!canTransitionReturn(current.status, to)) return yield* fail("BAD_REQUEST", `Transition invalide : ${current.status} → ${to}.`);
        const { settings } = yield* purchasingSettingsService.get(current.organizationId);
        const patch: Partial<typeof purchasingReturns.$inferInsert> = { status: to };
        if (current.status === "DRAFT" && to === "AUTHORIZED" && !current.number) {
          const { number } = yield* assignDocumentNumber(tx, {
            organizationId: current.organizationId, key: SUPPLIER_RETURN_NUMBERING_KEY,
            scheme: schemeWithPrefix(DEFAULT_SUPPLIER_RETURN_NUMBERING, settings.returnPrefix), date: purchasingToday(),
          }).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
          patch.number = number;
        }
        if (returnAffectsStock(current.status, to)) {
          const lines = yield* dbTry("purchasing.return.lines.get", () => tx.select().from(purchasingReturnLines).where(eq(purchasingReturnLines.returnId, id)));
          yield* logisticsStockPort.lockWarehouse(tx, current.warehouseId, current.organizationId);
          for (const line of lines) {
            const item = line.itemId
              ? (yield* dbTry("purchasing.return.item", () => tx.select().from(logisticsItems).where(eq(logisticsItems.id, line.itemId!)).limit(1)))[0]
              : yield* logisticsStockPort.findItemBySku(tx, line.sku, current.organizationId);
            if (!item) return yield* fail("BAD_REQUEST", `Article introuvable pour le SKU ${line.sku}.`);
            const movement = yield* logisticsStockPort.purchaseReturn(tx, {
              organizationId: current.organizationId, warehouseId: current.warehouseId, item, quantity: line.quantity, reference: patch.number ?? current.number ?? current.id,
            }, authorId);
            yield* dbTry("purchasing.return.movement", () => tx.update(purchasingReturnLines).set({ movementId: movement.id }).where(eq(purchasingReturnLines.id, line.id)));
          }
        }
        const [row] = yield* dbTry("purchasing.return.status", () => tx.update(purchasingReturns).set(patch).where(eq(purchasingReturns.id, id)).returning());
        return row!;
      })),

  recordQualityCheck: (input: {
    readonly organizationId: string | null; readonly receiptId: string; readonly notes?: string | null;
    readonly lines: readonly { readonly receiptLineId: string; readonly accepted: number; readonly rejected: number; readonly notes?: string | null }[];
  }, authorId: string) =>
    dbTransaction("purchasing.quality", (tx) =>
      Effect.gen(function* () {
        const [receipt] = yield* dbTry("purchasing.quality.receipt", () =>
          tx.select().from(purchasingReceipts).where(and(eq(purchasingReceipts.id, input.receiptId), sameTenant(purchasingReceipts.organizationId, input.organizationId))).limit(1).for("update"));
        if (!receipt) return yield* fail("NOT_FOUND", "Réception introuvable.");
        const receiptLines = yield* dbTry("purchasing.quality.receiptLines", () =>
          tx.select().from(purchasingReceiptLines).where(eq(purchasingReceiptLines.receiptId, input.receiptId)));
        const byId = new Map(receiptLines.map((line) => [line.id, line]));
        let accepted = 0, rejected = 0, received = 0;
        const computed = input.lines.map((line) => {
          const source = byId.get(line.receiptLineId);
          const rec = source?.quantity ?? 0;
          received += rec;
          accepted += line.accepted;
          rejected += line.rejected;
          return { ...line, result: qualityResultOf(line.accepted, line.rejected, rec) };
        });
        const status = qualityResultOf(accepted, rejected, received);
        const [existing] = yield* dbTry("purchasing.quality.find", () =>
          tx.select().from(purchasingQualityChecks).where(eq(purchasingQualityChecks.receiptId, input.receiptId)).limit(1));
        const values = { organizationId: input.organizationId, receiptId: input.receiptId, status, notes: input.notes ?? null, checkedBy: authorId, checkedAt: new Date() };
        const check = existing
          ? (yield* dbTry("purchasing.quality.update", () => tx.update(purchasingQualityChecks).set(values).where(eq(purchasingQualityChecks.id, existing.id)).returning()))[0]
          : (yield* dbTry("purchasing.quality.insert", () => tx.insert(purchasingQualityChecks).values(values).returning()))[0];
        yield* dbTry("purchasing.quality.lines.clear", () => tx.delete(purchasingQualityCheckLines).where(eq(purchasingQualityCheckLines.checkId, check!.id)));
        if (computed.length) {
          yield* dbTry("purchasing.quality.lines", () => tx.insert(purchasingQualityCheckLines).values(computed.map((line) => ({
            checkId: check!.id, receiptLineId: line.receiptLineId, accepted: line.accepted, rejected: line.rejected, result: line.result, notes: line.notes ?? null,
          }))));
        }
        return check!;
      })),

  allocateLandedCost: (input: {
    readonly organizationId: string | null; readonly orderId: string; readonly invoiceId?: string | null;
    readonly category: LandedCostCategory; readonly method: LandedCostMethod; readonly amountMinor: number; readonly currency: string; readonly notes?: string | null;
  }, authorId: string) =>
    dbTransaction("purchasing.landed", (tx) =>
      Effect.gen(function* () {
        const [order] = yield* dbTry("purchasing.landed.order", () =>
          tx.select().from(purchasing).where(and(eq(purchasing.id, input.orderId), sameTenant(purchasing.organizationId, input.organizationId))).limit(1));
        if (!order) return yield* fail("NOT_FOUND", "Commande introuvable.");
        const lines = yield* dbTry("purchasing.landed.lines", () =>
          tx.select().from(purchasingOrderLines).where(eq(purchasingOrderLines.orderId, input.orderId)).orderBy(asc(purchasingOrderLines.position)));
        const allocation = yield* allocateLandedCost(input.amountMinor, input.currency, input.method, lines.map((line) => ({
          orderLineId: line.id, netMinor: line.netMinor, quantity: line.quantity, weightGrams: 1,
        }))).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
        const [row] = yield* dbTry("purchasing.landed.insert", () => tx.insert(purchasingLandedCosts).values({
          organizationId: input.organizationId, orderId: input.orderId, invoiceId: input.invoiceId ?? null,
          category: input.category, method: input.method, amountMinor: input.amountMinor, currency: input.currency,
          allocated: true, notes: input.notes ?? null, createdBy: authorId,
        }).returning());
        yield* dbTry("purchasing.landed.alloc", () => tx.insert(purchasingLandedCostLines).values(allocation.map((line) => ({
          landedCostId: row!.id, orderLineId: line.orderLineId, amountMinor: line.amountMinor,
        }))));
        return { landedCost: row!, lines: allocation };
      })),

  exportSepa: (input: {
    readonly organizationId: string | null; readonly invoiceIds: readonly string[]; readonly requestedExecutionDate: string;
  }, authorId: string) =>
    Effect.gen(function* () {
      if (input.invoiceIds.length === 0) return yield* fail("BAD_REQUEST", "Sélectionnez au moins une facture.");
      const { settings } = yield* purchasingSettingsService.get(input.organizationId);
      if (!settings.debtorIban || !settings.debtorName) return yield* fail("BAD_REQUEST", "Configurez l'IBAN et le nom du débiteur dans les réglages d'achats.");
      const invoices = yield* dbTry("purchasing.sepa.invoices", () =>
        getDrizzle().select().from(purchasingInvoices).where(and(
          inArray(purchasingInvoices.id, [...input.invoiceIds]),
          sameTenant(purchasingInvoices.organizationId, input.organizationId),
        )));
      if (invoices.length !== input.invoiceIds.length) return yield* fail("NOT_FOUND", "Facture introuvable.");
      const payable = invoices.filter((invoice) => ["ISSUED", "PARTIALLY_PAID"].includes(invoice.status) && invoice.currency === "EUR");
      if (payable.length === 0) return yield* fail("BAD_REQUEST", "Aucune facture émise en EUR à régler.");
      const suppliers = yield* dbTry("purchasing.sepa.suppliers", () =>
        getDrizzle().select().from(purchasingSuppliers).where(inArray(purchasingSuppliers.id, [...new Set(payable.map((row) => row.supplierId))])));
      const bySupplier = new Map(suppliers.map((row) => [row.id, row]));
      const transfers: { endToEndId: string; amountMinor: number; currency: "EUR"; creditor: { name: string; iban: string; bic: string | null }; remittance: string; invoiceId: string }[] = [];
      for (const invoice of payable) {
        const supplier = bySupplier.get(invoice.supplierId);
        if (!supplier?.iban) return yield* fail("BAD_REQUEST", `IBAN manquant pour le fournisseur ${supplier?.name ?? invoice.supplierId}.`);
        const due = invoice.grossMinor - invoice.paidMinor - invoice.creditedMinor;
        if (due <= 0) continue;
        transfers.push({
          endToEndId: (invoice.number ?? invoice.id).replace(/[^A-Za-z0-9_\-.:]/g, "").slice(0, 35),
          amountMinor: due,
          currency: "EUR" as const,
          creditor: { name: supplier.name.slice(0, 70), iban: supplier.iban, bic: supplier.bic },
          remittance: invoice.supplierInvoiceNumber ?? invoice.number ?? invoice.id,
          invoiceId: invoice.id,
        });
      }
      if (transfers.length === 0) return yield* fail("BAD_REQUEST", "Aucun montant dû à virer.");
      return yield* dbTransaction("purchasing.sepa.export", (tx) =>
        Effect.gen(function* () {
          const { number } = yield* assignDocumentNumber(tx, {
            organizationId: input.organizationId, key: SEPA_EXPORT_NUMBERING_KEY,
            scheme: schemeWithPrefix(DEFAULT_SEPA_EXPORT_NUMBERING, settings.sepaPrefix), date: input.requestedExecutionDate,
          }).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
          const xml = yield* renderPain001({
            messageId: number.replace(/[^A-Za-z0-9_\-.:]/g, "").slice(0, 35),
            createdAt: new Date(),
            requestedExecutionDate: input.requestedExecutionDate,
            paymentInfoId: `${number.replace(/[^A-Za-z0-9_\-.:]/g, "").slice(0, 30)}-1`,
            debtor: { name: settings.debtorName!.slice(0, 70), iban: settings.debtorIban!, bic: settings.debtorBic },
            transfers,
          }).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
          const bytes = new TextEncoder().encode(xml);
          const storageKey = `purchasing/${input.organizationId ?? "platform"}/sepa/${number}.xml`;
          yield* privateStorage().put(storageKey, bytes, { contentType: "application/vnd.iso20022+xml", cacheControl: "private, no-store" });
          const [row] = yield* dbTry("purchasing.sepa.insert", () => tx.insert(purchasingSepaExports).values({
            organizationId: input.organizationId, number, status: "EXPORTED", paymentCount: transfers.length,
            totalMinor: transfers.reduce((sum, transfer) => sum + transfer.amountMinor, 0), currency: "EUR",
            storageKey, sha256: sha256(bytes), requestedExecutionDate: input.requestedExecutionDate, createdBy: authorId,
          }).returning());
          return { export: row!, xml };
        }));
    }),

  importEinvoice: (input: { readonly organizationId: string | null; readonly filename: string; readonly bytes: Uint8Array }, authorId: string) =>
    Effect.gen(function* () {
      const isPdf = input.filename.toLowerCase().endsWith(".pdf") || (input.bytes[0] === 0x25 && input.bytes[1] === 0x50);
      const xml = isPdf
        ? yield* extractEmbeddedInvoiceXml(input.bytes).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)))
        : new TextDecoder().decode(input.bytes);
      const parsed = yield* parseIncomingInvoiceXml(xml).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      const [supplier] = yield* dbTry("purchasing.import.supplier", () => getDrizzle().select().from(purchasingSuppliers).where(and(
        sameTenant(purchasingSuppliers.organizationId, input.organizationId),
        parsed.sellerVat
          ? sql`upper(coalesce(${purchasingSuppliers.vatNumber}, '')) = ${parsed.sellerVat.toUpperCase()}`
          : sql`lower(${purchasingSuppliers.name}) = ${parsed.sellerName.toLowerCase()}`,
      )).limit(1));
      const importId = crypto.randomUUID();
      const storageKey = `purchasing/${input.organizationId ?? "platform"}/einvoices/${importId}-${input.filename.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
      yield* privateStorage().put(storageKey, input.bytes, { contentType: isPdf ? "application/pdf" : "text/xml", cacheControl: "private, no-store" });
      const [row] = yield* dbTry("purchasing.import.insert", () => getDrizzle().insert(purchasingEinvoiceImports).values({
        id: importId, organizationId: input.organizationId, filename: input.filename, format: parsed.format,
        status: supplier ? "parsed" : "unmatched_supplier", supplierId: supplier?.id ?? null, storageKey, createdBy: authorId,
      }).returning());
      if (!supplier) return { import: row!, invoice: null as null };
      const invoice = yield* purchasingInvoicesService.create({
        organizationId: input.organizationId,
        supplierId: supplier.id,
        title: parsed.number,
        supplierInvoiceNumber: parsed.number,
        currency: parsed.currency,
        notes: `Import ${parsed.format} ${input.filename}`,
        lines: parsed.lines.map((line) => ({
          description: line.name,
          quantity: Math.max(1, Math.round(line.quantity)),
          unitPrice: (line.unitPriceMinor / 100).toFixed(2),
          ratePercent: line.vatRatePercent,
        })),
      }, authorId);
      const [updated] = yield* dbTry("purchasing.import.link", () =>
        getDrizzle().update(purchasingEinvoiceImports).set({ invoiceId: invoice.id, status: "imported" }).where(eq(purchasingEinvoiceImports.id, importId)).returning());
      yield* dbTry("purchasing.import.invoice.storage", () =>
        getDrizzle().update(purchasingInvoices).set({ importId, storageKey }).where(eq(purchasingInvoices.id, invoice.id)));
      return { import: updated!, invoice };
    }),

  saveReorderRule: (input: ReorderRuleInput & { readonly organizationId: string | null; readonly itemId: string; readonly warehouseId: string; readonly preferredSupplierId?: string | null; readonly active?: boolean }) =>
    Effect.gen(function* () {
      yield* validateReorderRule(input).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      const db = getDrizzle();
      const [existing] = yield* dbTry("purchasing.reorder.find", () => db.select().from(purchasingReorderRules).where(and(
        sameTenant(purchasingReorderRules.organizationId, input.organizationId),
        eq(purchasingReorderRules.itemId, input.itemId),
        eq(purchasingReorderRules.warehouseId, input.warehouseId),
      )).limit(1));
      const values = {
        organizationId: input.organizationId, itemId: input.itemId, warehouseId: input.warehouseId,
        minQty: input.minQty, maxQty: input.maxQty, packQty: input.packQty,
        preferredSupplierId: input.preferredSupplierId ?? null, active: input.active ?? true,
      };
      if (existing) {
        const [row] = yield* dbTry("purchasing.reorder.update", () => db.update(purchasingReorderRules).set(values).where(eq(purchasingReorderRules.id, existing.id)).returning());
        return row!;
      }
      const [row] = yield* dbTry("purchasing.reorder.insert", () => db.insert(purchasingReorderRules).values(values).returning());
      return row!;
    }),

  runReorder: (organizationId: string | null, authorId: string | null) =>
    Effect.gen(function* () {
      const { settings } = yield* purchasingSettingsService.get(organizationId);
      if (settings.reorderMode === "off") return { suggestions: 0, drafts: 0, sent: 0 };
      const rules = yield* dbTry("purchasing.reorder.rules", () =>
        getDrizzle().select().from(purchasingReorderRules).where(and(sameTenant(purchasingReorderRules.organizationId, organizationId), eq(purchasingReorderRules.active, true))));
      let suggestions = 0, drafts = 0, sent = 0;
      const createdBySupplier = new Map<string, { warehouseId: string; lines: { sku: string; description: string | null; quantity: number; unitPrice: string }[]; trusted: boolean }>();
      for (const rule of rules) {
        const [item] = yield* dbTry("purchasing.reorder.item", () => getDrizzle().select().from(logisticsItems).where(eq(logisticsItems.id, rule.itemId)).limit(1));
        if (!item) continue;
        const [stock] = yield* dbTry("purchasing.reorder.stock", () => getDrizzle().select({
          onHand: sql<number>`coalesce(sum(${logisticsStockMovements.delta}), 0)`.mapWith(Number),
        }).from(logisticsStockMovements).where(and(eq(logisticsStockMovements.warehouseId, rule.warehouseId), eq(logisticsStockMovements.itemId, rule.itemId))));
        const [open] = yield* dbTry("purchasing.reorder.open", () => getDrizzle().select({
          outstanding: sql<number>`coalesce(sum(${purchasingOrderLines.quantity} - ${purchasingOrderLines.receivedQuantity}), 0)`.mapWith(Number),
        }).from(purchasingOrderLines).innerJoin(purchasing, eq(purchasing.id, purchasingOrderLines.orderId)).where(and(
          eq(purchasingOrderLines.itemId, rule.itemId),
          inArray(purchasing.status, ["SENT", "PARTIALLY_RECEIVED", "PENDING_APPROVAL"]),
          sql`coalesce(${purchasingOrderLines.warehouseId}, ${purchasing.warehouseId}) = ${rule.warehouseId}`,
        )));
        const suggestion = suggestReorder(rule, { onHand: stock?.onHand ?? 0, outstanding: open?.outstanding ?? 0, reserved: 0 }, settings.reorderIncludeReservations);
        if (!suggestion) continue;
        const [row] = yield* dbTry("purchasing.reorder.suggest", () => getDrizzle().insert(purchasingReorderSuggestions).values({
          organizationId, ruleId: rule.id, itemId: rule.itemId, warehouseId: rule.warehouseId, supplierId: rule.preferredSupplierId,
          onHand: suggestion.onHand, outstanding: suggestion.outstanding, reserved: 0, suggestedQty: suggestion.suggestedQty, status: "open",
        }).returning());
        suggestions += 1;
        if (!rule.preferredSupplierId) continue;
        const action = reorderAction(settings.reorderMode, settings.reorderAutoSendTrustedOnly, false);
        if (!action.createDraft || !authorId) continue;
        const bucket = createdBySupplier.get(rule.preferredSupplierId) ?? { warehouseId: rule.warehouseId, lines: [], trusted: false };
        const [supplierItem] = yield* dbTry("purchasing.reorder.price", () => getDrizzle().select().from(purchasingSuppliers).where(eq(purchasingSuppliers.id, rule.preferredSupplierId!)).limit(1));
        bucket.trusted = supplierItem?.trustedCatalogue ?? false;
        bucket.lines.push({ sku: item.sku, description: item.name, quantity: suggestion.suggestedQty, unitPrice: "0.00" });
        createdBySupplier.set(rule.preferredSupplierId, bucket);
        void row;
      }
      if (authorId && (settings.reorderMode === "auto_draft" || settings.reorderMode === "auto_send")) {
        for (const [supplierId, bucket] of createdBySupplier) {
          if (bucket.lines.length === 0) continue;
          const order = yield* purchasingService.createOrder({
            organizationId, title: `Réassort ${purchasingToday()}`, supplierId, warehouseId: bucket.warehouseId,
            currency: settings.defaultCurrency, expectedDate: null, notes: "Généré par le réassort automatique.", lines: bucket.lines,
          }, authorId);
          drafts += 1;
          yield* dbTry("purchasing.reorder.link", () =>
            getDrizzle().update(purchasingReorderSuggestions).set({ status: "ordered", orderId: order.id }).where(and(
              eq(purchasingReorderSuggestions.status, "open"), eq(purchasingReorderSuggestions.supplierId, supplierId), sameTenant(purchasingReorderSuggestions.organizationId, organizationId),
            )));
          if (canAutoSend(settings, bucket.trusted)) {
            // L'envoi passe par la transition (approbation éventuelle, PDF, e-mail).
            sent += 0;
          }
        }
      }
      return { suggestions, drafts, sent };
    }),

  startPunchOut: (input: { readonly organizationId: string | null; readonly supplierId: string; readonly hookUrl: string; readonly buyerIdentity: PunchOutIdentity }, authorId: string) =>
    Effect.gen(function* () {
      const [supplier] = yield* dbTry("purchasing.punchout.supplier", () =>
        getDrizzle().select().from(purchasingSuppliers).where(and(eq(purchasingSuppliers.id, input.supplierId), sameTenant(purchasingSuppliers.organizationId, input.organizationId))).limit(1));
      if (!supplier) return yield* fail("NOT_FOUND", "Fournisseur introuvable.");
      if (!supplier.punchoutEnabled || !supplier.punchoutSetupUrl || !supplier.punchoutSecret) {
        return yield* fail("BAD_REQUEST", "Le punch-out n'est pas configuré pour ce fournisseur.");
      }
      const cookie = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const mac = punchOutMac(cookie, supplier.punchoutSecret);
      const hookUrl = `${input.hookUrl}${input.hookUrl.includes("?") ? "&" : "?"}mac=${mac}`;
      const supplierIdentity = { domain: supplier.punchoutDomain ?? "NetworkId", identity: supplier.punchoutIdentity ?? supplier.code, secret: "" };
      const sender = { ...input.buyerIdentity, secret: supplier.punchoutSecret };
      const setup = yield* renderPunchOutSetupRequest({
        buyerCookie: cookie,
        from: input.buyerIdentity,
        to: supplierIdentity,
        sender,
        hookUrl,
        timestamp: new Date(),
      }).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      const [session] = yield* dbTry("purchasing.punchout.session", () => getDrizzle().insert(purchasingPunchoutSessions).values({
        organizationId: input.organizationId, supplierId: supplier.id, buyerCookie: cookie, status: "pending", hookUrl: input.hookUrl, expiresAt, createdBy: authorId,
      }).returning());
      return { session: session!, xml: setup, setupUrl: supplier.punchoutSetupUrl };
    }),

  completePunchOut: (cookie: string, xml: string, secret: string, authorId: string) =>
    Effect.gen(function* () {
      const [session] = yield* dbTry("purchasing.punchout.find", () =>
        getDrizzle().select().from(purchasingPunchoutSessions).where(eq(purchasingPunchoutSessions.buyerCookie, cookie)).limit(1));
      if (!session) return yield* fail("NOT_FOUND", "Session punch-out introuvable.");
      if (session.status !== "pending" || session.expiresAt.getTime() < Date.now()) return yield* fail("BAD_REQUEST", "Session punch-out expirée ou déjà close.");
      const [supplier] = yield* dbTry("purchasing.punchout.supplier2", () =>
        getDrizzle().select().from(purchasingSuppliers).where(eq(purchasingSuppliers.id, session.supplierId)).limit(1));
      if (!supplier) return yield* fail("NOT_FOUND", "Fournisseur introuvable.");
      const expectedMac = punchOutMac(cookie, supplier.punchoutSecret ?? secret);
      if (secret && secret !== expectedMac && punchOutMac(cookie, secret) !== expectedMac) {
        // Le secret passé par l'appelant peut être la MAC (route publique) ou le secret partagé.
        if (secret !== supplier.punchoutSecret) return yield* fail("FORBIDDEN", "Session punch-out non authentifiée.");
      }
      const parsed = yield* parsePunchOutOrderMessage(xml).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      if (parsed.cookie !== cookie) return yield* fail("BAD_REQUEST", "Cookie punch-out invalide.");
      const { settings } = yield* purchasingSettingsService.get(session.organizationId);
      // Un entrepôt est requis : on reprend le premier du tenant via une commande brouillon seulement si des articles sont présents.
      if (parsed.items.length === 0) return yield* fail("BAD_REQUEST", "Le panier punch-out est vide.");
      // L'entrepôt n'est pas dans le message cXML : l'utilisateur complète le brouillon dans l'admin.
      const [warehouse] = yield* dbTry("purchasing.punchout.wh", () => getDrizzle().select({ id: logisticsWarehouses.id }).from(logisticsWarehouses).where(sameTenant(logisticsWarehouses.organizationId, session.organizationId)).orderBy(asc(logisticsWarehouses.code)).limit(1));
      if (!warehouse) return yield* fail("BAD_REQUEST", "Aucun entrepôt disponible pour créer le brouillon punch-out.");
      const order = yield* purchasingService.createOrder({
        organizationId: session.organizationId,
        title: `Punch-out ${supplier.name}`,
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        currency: parsed.items[0]?.currency ?? settings.defaultCurrency,
        expectedDate: null,
        notes: "Créé depuis un punch-out fournisseur.",
        lines: parsed.items.map((item) => ({
          sku: item.supplierPartId.slice(0, 64),
          description: item.description,
          quantity: Math.max(1, Math.round(item.quantity)),
          unitPrice: (item.unitPriceMinor / 100).toFixed(2),
        })),
      }, authorId);
      yield* dbTry("purchasing.punchout.close", () =>
        getDrizzle().update(purchasingPunchoutSessions).set({ status: "completed", orderId: order.id }).where(eq(purchasingPunchoutSessions.id, session.id)));
      return { session, order };
    }),
};
