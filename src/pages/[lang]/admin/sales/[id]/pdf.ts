/**
 * GET /<lang>/admin/sales/<id>/pdf — téléchargement du PDF d'un document de vente.
 * Garde : session + permission `sales:read` dans le tenant du document (organisation lue en
 * base) ; limite de débit par utilisateur. Rendu : gabarit sales → port `PdfRenderer`
 * (Puppeteer). Facture / avoir émis + profil vendeur complet → PDF/A-3B Factur-X EN 16931
 * (`factur-x.xml` joint) ; sinon PDF simple. En-tête `X-Factur-X` : `EN 16931` ou
 * `unavailable; reason=<motif>` (auditable). Moteur indisponible → 503, délai dépassé → 504.
 * Réponse diffusée par blocs.
 */
import type { APIRoute } from "astro";
import { Effect } from "effect";
import { toLocale } from "@i18n/utils";
import type { Locale } from "@i18n/config";
import { ActionFailure, actionRateLimit } from "@/lib/effect/action";
import { renderFailureStatus, salesPdfResponse } from "@/modules/sales/documents/response";
import { salesOrganizationOf } from "@/modules/sales/loaders";
import { requireSalesPermission } from "@/modules/sales/permissions";

export const prerender = false;

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, TOO_MANY_REQUESTS: 429 };

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
    return yield* salesPdfResponse(id, owner.organizationId, locale);
  });
  const result = await Effect.runPromise(Effect.result(program));
  if (result._tag === "Success") return result.success;
  const error = result.failure;
  const render = renderFailureStatus(error);
  if (render !== null) return new Response(null, { status: render });
  if (error instanceof ActionFailure) return new Response(null, { status: STATUS[error.code] ?? 500 });
  return new Response(null, { status: 500 });
};
