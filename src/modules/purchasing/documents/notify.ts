/** Génère le PDF de BC, le stocke, et met l'e-mail fournisseur en file (pièce jointe). */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { PrivateStorage } from "@/lib/storage/private";
import { enqueueEmail } from "@/core/notifications/email-outbox";
import { PuppeteerPdfRendererLive } from "@/lib/pdf/puppeteer";
import { logisticsWarehouses } from "@/modules/logistics/schema";
import { purchasing, purchasingOrderLines, purchasingSuppliers } from "../schema";
import { renderPurchaseOrderPdf } from "./pdf";
import { purchaseOrderPdfFilename } from "./template";
import { PURCHASE_ORDER_SEND_TEMPLATE } from "../notifications/po-send-email";
import { resolvePurchasingEmailOverride } from "../services/email-templates.service";
import type { Locale } from "@i18n/config";

export const notifyPurchaseOrderSent = (orderId: string, locale: Locale) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const [order] = yield* dbTry("purchasing.notify.order", () => db.select().from(purchasing).where(eq(purchasing.id, orderId)).limit(1));
    if (!order || !order.number) return null;
    const [supplier] = yield* dbTry("purchasing.notify.supplier", () => db.select().from(purchasingSuppliers).where(eq(purchasingSuppliers.id, order.supplierId)).limit(1));
    if (!supplier?.email) return null;
    const lines = yield* dbTry("purchasing.notify.lines", () => db.select().from(purchasingOrderLines).where(eq(purchasingOrderLines.orderId, orderId)));
    const [warehouse] = yield* dbTry("purchasing.notify.wh", () => db.select().from(logisticsWarehouses).where(eq(logisticsWarehouses.id, order.warehouseId)).limit(1));
    const pdf = yield* renderPurchaseOrderPdf({
      number: order.number, title: order.title, status: order.status, currency: order.currency, expectedDate: order.expectedDate,
      notes: order.notes, netMinor: order.netMinor, taxMinor: order.taxMinor, grossMinor: order.grossMinor,
      supplierName: supplier.name, supplierAddress: supplier.address, supplierVatNumber: supplier.vatNumber,
      warehouseName: warehouse?.name ?? null,
      lines: lines.map((line) => ({ sku: line.sku, description: line.description, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, netMinor: line.netMinor })),
    }, locale).pipe(Effect.provide(PuppeteerPdfRendererLive));
    const filename = purchaseOrderPdfFilename(order);
    const storageKey = `purchasing/${order.organizationId ?? "platform"}/orders/${order.number}.pdf`;
    const storage = yield* PrivateStorage;
    yield* storage.put(storageKey, pdf, { contentType: "application/pdf", cacheControl: "private, no-store" });
    const override = yield* resolvePurchasingEmailOverride(order.organizationId, locale, "po_send");
    return yield* enqueueEmail({
      dedupeKey: `purchasing.po-send:${order.id}:${order.number}`,
      organizationId: order.organizationId,
      toEmail: supplier.email,
      locale,
      template: PURCHASE_ORDER_SEND_TEMPLATE,
      category: "purchasing",
      data: {
        number: order.number, title: order.title, supplierName: supplier.name,
        ...(override ? { overrideSubject: override.subject, overrideBody: override.bodyHtml } : {}),
      },
      attachments: [{ filename, contentType: "application/pdf", storageKey }],
    });
  });
