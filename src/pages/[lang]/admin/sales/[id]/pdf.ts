/**
 * GET /<lang>/admin/sales/<id>/pdf — téléchargement du PDF d'un document de vente.
 * Garde : session + permission `sales:read` dans le tenant du document (organisation lue en
 * base) ; limite de débit par utilisateur. Rendu : gabarit sales → port `PdfRenderer`
 * (Puppeteer). Moteur indisponible → 503, délai dépassé → 504. Réponse diffusée par blocs.
 */
import type { APIRoute } from "astro";
import { Effect } from "effect";
import { toLocale } from "@i18n/utils";
import type { Locale } from "@i18n/config";
import { getActiveThemeCss } from "@database/loaders/site.loader";
import { DocumentRenderError } from "@/core/documents";
import { ActionFailure, actionRateLimit } from "@/lib/effect/action";
import { PuppeteerPdfRendererLive } from "@/lib/pdf/puppeteer";
import { renderSalesDocumentPdf, salesPdfFilename } from "@/modules/sales/documents";
import { loadSalesDocument, salesOrganizationOf } from "@/modules/sales/loaders";
import { requireSalesPermission } from "@/modules/sales/permissions";

export const prerender = false;

const CHUNK = 64 * 1024;
const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, TOO_MANY_REQUESTS: 429 };

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

export const GET: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const locale = toLocale(context.params.lang) as Locale;
  // Pas de session : refus avant toute lecture (l'existence d'un document ne se sonde pas).
  if (!context.locals.user) return new Response(null, { status: 401 });
  const program = Effect.gen(function* () {
    const owner = yield* Effect.promise(() => salesOrganizationOf(id));
    if (!owner) return new Response(null, { status: 404 });
    yield* requireSalesPermission(context, ["read"], owner.organizationId);
    yield* actionRateLimit(context.locals.user?.id ?? "anonymous", "sales:pdf", { window: 60, max: 20 });
    const doc = yield* Effect.promise(() => loadSalesDocument(id, owner.organizationId));
    if (!doc) return new Response(null, { status: 404 });
    const themeCss = yield* Effect.promise(() => getActiveThemeCss().catch(() => ""));
    const pdf = yield* renderSalesDocumentPdf(doc, { locale, themeCss }).pipe(Effect.provide(PuppeteerPdfRendererLive));
    return new Response(streamOf(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `attachment; filename="${salesPdfFilename(doc)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
  const result = await Effect.runPromise(Effect.result(program));
  if (result._tag === "Success") return result.success;
  const error = result.failure;
  if (error instanceof DocumentRenderError) return new Response(null, { status: error.reason === "timeout" ? 504 : error.reason === "unavailable" ? 503 : 500 });
  if (error instanceof ActionFailure) return new Response(null, { status: STATUS[error.code] ?? 500 });
  return new Response(null, { status: 500 });
};
