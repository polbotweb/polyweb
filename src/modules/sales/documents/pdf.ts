/** PDF d'un document de vente : gabarit HTML → port `PdfRenderer` (Effect). */
import { Effect } from "effect";
import { PdfRenderer } from "@/core/documents";
import { renderSalesDocumentHtml, type PrintableSalesDocument, type SalesPrintOptions } from "./template";

export const renderSalesDocumentPdf = (doc: PrintableSalesDocument, options: SalesPrintOptions) =>
  Effect.gen(function* () {
    const renderer = yield* PdfRenderer;
    return yield* renderer.render(renderSalesDocumentHtml(doc, options));
  });
