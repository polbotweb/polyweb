/**
 * Réponse HTTP du PDF d'un document de vente, partagée par l'admin et le portail client (l'appelant
 * a déjà contrôlé l'accès). Gabarit sales → port `PdfRenderer` (Puppeteer). Facture / avoir émis +
 * profil vendeur complet → PDF/A-3B Factur-X EN 16931 (`factur-x.xml` joint) ; sinon PDF simple.
 * En-tête `X-Factur-X` : `EN 16931` ou `unavailable; reason=<motif>` (auditable). Diffusée par blocs.
 */
import { Effect } from "effect";
import type { Locale } from "@i18n/config";
import { getActiveThemeCss } from "@database/loaders/site.loader";
import { DocumentRenderError } from "@/core/documents";
import { FACTURX_CONFORMANCE_LEVEL, embedFacturX } from "@/core/einvoice";
import { PuppeteerPdfRendererLive } from "@/lib/pdf/puppeteer";
import { salesFacturXml } from "../domain/einvoice";
import { loadSalesDocument, sellerProfileOf, toSellerProfile } from "../loaders";
import { renderSalesDocumentPdf } from "./pdf";
import { salesPdfFilename } from "./template";

const CHUNK = 64 * 1024;

const streamOf = (bytes: Uint8Array) => {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + CHUNK));
      offset += CHUNK;
    },
  });
};

/** PDF du document `id` du tenant `organizationId` (404 s'il n'existe pas dans ce tenant). */
export const salesPdfResponse = (id: string, organizationId: string | null, locale: Locale) =>
  Effect.gen(function* () {
    const doc = yield* Effect.promise(() => loadSalesDocument(id, organizationId));
    if (!doc) return new Response(null, { status: 404 });
    const themeCss = yield* Effect.promise(() => getActiveThemeCss().catch(() => ""));
    const profileRow = yield* sellerProfileOf(organizationId);
    const seller = profileRow ? toSellerProfile(profileRow) : null;
    const visual = yield* renderSalesDocumentPdf(doc, { locale, themeCss, seller }).pipe(Effect.provide(PuppeteerPdfRendererLive));
    const facturX = yield* Effect.result(salesFacturXml(doc, seller, locale));
    const pdf = facturX._tag === "Success"
      ? yield* embedFacturX(visual, facturX.success.xml, { title: `${doc.number} — ${doc.title}`, author: seller?.legalName, producer: "polyweb" })
      : visual;
    const facturXHeader = facturX._tag === "Success" ? FACTURX_CONFORMANCE_LEVEL : `unavailable; reason=${facturX.failure.reason}`;
    if (facturX._tag === "Failure" && facturX.failure.reason !== "not-invoice" && facturX.failure.reason !== "not-issued") {
      yield* Effect.logWarning("sales.pdf: Factur-X non produit").pipe(Effect.annotateLogs({ documentId: id, reason: facturX.failure.reason, detail: facturX.failure.detail ?? "" }));
    }
    return new Response(streamOf(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `attachment; filename="${salesPdfFilename(doc)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Factur-X": facturXHeader,
      },
    });
  });

/** Statut HTTP d'un échec de rendu (moteur indisponible → 503, délai → 504), sinon null. */
export const renderFailureStatus = (error: unknown): number | null =>
  error instanceof DocumentRenderError ? (error.reason === "timeout" ? 504 : error.reason === "unavailable" ? 503 : 500) : null;
