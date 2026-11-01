/**
 * Points d'entrée HTTP du portail client. Session obligatoire (sinon 401 / connexion) ; tout accès
 * unitaire passe par un contrôle de propriété : l'enregistrement d'autrui répond 404, exactement
 * comme un identifiant inexistant (aucune énumération possible).
 */
import type { APIContext } from "astro";
import { Effect } from "effect";
import { toLocale } from "@i18n/utils";
import type { Locale } from "@i18n/config";
import { actionRateLimit, ActionFailure } from "@/lib/effect/action";
import { runAppResult } from "@/lib/effect/http";
import { renderFailureStatus, salesPdfResponse } from "@/modules/sales/documents/response";
import { ownedInvoice } from "../services/portal.service";
import { resolvePortalTarget, type PortalTarget } from "./links";

const PRIVATE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } as const;
const empty = (status: number) => new Response(null, { status, headers: PRIVATE });

/** GET : redirection 303 vers le parcours signé de l'enregistrement du client, sinon 404. */
export const portalRedirect = async (context: APIContext, target: PortalTarget): Promise<Response> => {
  const user = context.locals.user;
  if (!user || user.banned) return empty(401);
  const locale = toLocale(context.params.lang) as Locale;
  const result = await runAppResult(resolvePortalTarget(user.id, target, context.params.id ?? "", locale));
  if (!result.ok) return empty(500);
  if (!result.value) return empty(404);
  return new Response(null, { status: 303, headers: { ...PRIVATE, Location: result.value } });
};

const FAILURE_STATUS: Record<string, number> = { TOO_MANY_REQUESTS: 429 };

/** GET : PDF (Factur-X si possible) d'une facture/avoir émis du client. */
export const portalInvoicePdf = async (context: APIContext): Promise<Response> => {
  const user = context.locals.user;
  if (!user || user.banned) return empty(401);
  const locale = toLocale(context.params.lang) as Locale;
  const program = Effect.gen(function* () {
    yield* actionRateLimit(user.id, "portal:pdf", { window: 60, max: 20 });
    const owned = yield* ownedInvoice(user.id, context.params.id ?? "");
    if (!owned) return empty(404);
    return yield* salesPdfResponse(owned.id, owned.organizationId, locale);
  });
  const result = await Effect.runPromise(Effect.result(program));
  if (result._tag === "Success") return result.success;
  const render = renderFailureStatus(result.failure);
  if (render !== null) return empty(render);
  if (result.failure instanceof ActionFailure) return empty(FAILURE_STATUS[result.failure.code] ?? 500);
  return empty(500);
};
