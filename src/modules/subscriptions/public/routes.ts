/**
 * Points d'entrée HTTP client du module subscriptions (formulaires POST sans JavaScript, origine
 * contrôlée par le middleware) :
 * - souscription : session obligatoire, puis redirection 303 vers la page de paiement du fournisseur ;
 * - résiliation / reprise depuis le portail : contrôle de propriété, l'abonnement d'autrui répond 404
 *   exactement comme un identifiant inexistant (aucune énumération).
 */
import type { APIContext } from "astro";
import { Effect } from "effect";
import { toLocale } from "@i18n/utils";
import type { Locale } from "@i18n/config";
import { actionRateLimit, ActionFailure } from "@/lib/effect/action";
import { runAppResult } from "@/lib/effect/http";
import { subscriptionsService } from "../services/subscription.service";

const PRIVATE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } as const;
const empty = (status: number) => new Response(null, { status, headers: PRIVATE });
const seeOther = (location: string) => new Response(null, { status: 303, headers: { ...PRIVATE, Location: location } });
const FAILURE_STATUS: Record<string, number> = { NOT_FOUND: 404, CONFLICT: 409, BAD_REQUEST: 400, TOO_MANY_REQUESTS: 429, FORBIDDEN: 403 };

const failureStatus = (failure: unknown) => (failure instanceof ActionFailure ? FAILURE_STATUS[failure.code] ?? 500 : 500);

/** POST /<lang>/subscriptions/checkout — `priceId`, `country` (ISO 3166-1 alpha-2, particulier). */
export const subscriptionCheckout = async (context: APIContext): Promise<Response> => {
  const locale = toLocale(context.params.lang) as Locale;
  const user = context.locals.user;
  // Non connecté : retour au catalogue, qui propose la connexion.
  if (!user) return seeOther(`/${locale}/subscriptions`);
  if (user.banned) return empty(403);
  const form = await context.request.formData().catch(() => null);
  const priceId = String(form?.get("priceId") ?? "");
  const country = String(form?.get("country") ?? "").trim().toUpperCase();
  if (!/^[0-9a-f-]{36}$/i.test(priceId) || !/^[A-Z]{2}$/.test(country)) return empty(400);
  const back = `${context.url.origin}/${locale}/subscriptions`;
  const result = await runAppResult(Effect.gen(function* () {
    yield* actionRateLimit(user.id, "subscriptions:checkout", { window: 60, max: 5 });
    return yield* subscriptionsService.startCheckout(priceId, { userId: user.id, email: user.email, name: user.name || user.email, country, customerType: "B2C" },
      { successUrl: `${back}?status=success`, cancelUrl: `${back}?status=cancelled` });
  }));
  if (!result.ok) return failureStatus(result.error) === 500 ? seeOther(`/${locale}/subscriptions?status=error`) : empty(failureStatus(result.error));
  return seeOther(result.value.url);
};

/** POST /<lang>/account/subscriptions/<id>/(cancel|resume) — puis retour 303 au portail. */
export const portalSubscriptionAction = async (context: APIContext, op: "cancel" | "resume"): Promise<Response> => {
  const user = context.locals.user;
  if (!user || user.banned) return empty(401);
  const locale = toLocale(context.params.lang) as Locale;
  const id = context.params.id ?? "";
  const result = await runAppResult(Effect.gen(function* () {
    yield* actionRateLimit(user.id, "portal:subscription", { window: 60, max: 10 });
    return op === "cancel" ? yield* subscriptionsService.cancelOwned(user.id, id) : yield* subscriptionsService.resumeOwned(user.id, id);
  }));
  if (!result.ok) return empty(failureStatus(result.error));
  return seeOther(`/${locale}/account#subscriptions`);
};
