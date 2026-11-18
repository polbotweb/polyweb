import { Effect } from "effect";
import { PdfRenderer } from "@/core/documents";
import { renderPurchaseOrderHtml, type PrintablePurchaseOrder } from "./template";
import type { Locale } from "@i18n/config";

export const renderPurchaseOrderPdf = (doc: PrintablePurchaseOrder, locale: Locale, themeCss = "") =>
  Effect.gen(function* () {
    const renderer = yield* PdfRenderer;
    return yield* renderer.render(renderPurchaseOrderHtml(doc, locale, themeCss));
  });
