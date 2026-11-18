/**
 * GET /<lang>/admin/purchasing/<id>/pdf — PDF du bon de commande (session + purchasing:read).
 */
import type { APIRoute } from "astro";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { toLocale } from "@i18n/utils";
import type { Locale } from "@i18n/config";
import { getDrizzle } from "@database/drizzle";
import { ActionFailure, actionRateLimit } from "@/lib/effect/action";
import { PuppeteerPdfRendererLive } from "@/lib/pdf/puppeteer";
import { logisticsWarehouses } from "@/modules/logistics/schema";
import { purchasing, purchasingOrderLines, purchasingSuppliers } from "@/modules/purchasing/schema";
import { renderPurchaseOrderPdf, purchaseOrderPdfFilename } from "@/modules/purchasing/documents";
import { requirePurchasingPermission } from "@/modules/purchasing/permissions";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const locale = toLocale(context.params.lang) as Locale;
  if (!context.locals.user) return new Response(null, { status: 401 });
  const program = Effect.gen(function* () {
    const db = getDrizzle();
    const [order] = yield* Effect.promise(() => db.select().from(purchasing).where(eq(purchasing.id, id)).limit(1));
    if (!order) return new Response(null, { status: 404 });
    yield* requirePurchasingPermission(context, ["read"], order.organizationId);
    yield* actionRateLimit(context.locals.user?.id ?? "anonymous", "purchasing:pdf", { window: 60, max: 20 });
    const [supplier] = yield* Effect.promise(() => db.select().from(purchasingSuppliers).where(eq(purchasingSuppliers.id, order.supplierId)).limit(1));
    const lines = yield* Effect.promise(() => db.select().from(purchasingOrderLines).where(eq(purchasingOrderLines.orderId, id)));
    const [warehouse] = yield* Effect.promise(() => db.select().from(logisticsWarehouses).where(eq(logisticsWarehouses.id, order.warehouseId)).limit(1));
    const pdf = yield* renderPurchaseOrderPdf({
      number: order.number, title: order.title, status: order.status, currency: order.currency, expectedDate: order.expectedDate,
      notes: order.notes, netMinor: order.netMinor, taxMinor: order.taxMinor, grossMinor: order.grossMinor,
      supplierName: supplier?.name ?? "", supplierAddress: supplier?.address ?? null, supplierVatNumber: supplier?.vatNumber ?? null,
      warehouseName: warehouse?.name ?? null,
      lines: lines.map((line) => ({ sku: line.sku, description: line.description, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, netMinor: line.netMinor })),
    }, locale).pipe(Effect.provide(PuppeteerPdfRendererLive));
    return new Response(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${purchaseOrderPdfFilename(order)}"`,
        "cache-control": "private, no-store",
      },
    });
  });
  const result = await Effect.runPromise(Effect.result(program));
  if (result._tag === "Success") return result.success;
  const error = result.failure;
  if (error instanceof ActionFailure) {
    const table: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, BAD_REQUEST: 400, TOO_MANY_REQUESTS: 429 };
    const status = table[error.code] ?? 500;
    return new Response(null, { status });
  }
  return new Response(null, { status: 500 });
};
