/**
 * Désinscription « un clic » RFC 8058 (D1). `POST ?token=…` avec le corps exact
 * `List-Unsubscribe=One-Click` : désactive le canal e-mail de la catégorie du jeton.
 * - Autorisation : jeton signé expirant (canal `email`) seulement — aucune session ni cookie lus ou posés.
 * - Hôte de confiance : le Host reçu doit être celui de `SITE_URL` (pas de lien honoré sur un hôte injecté).
 * - Rejouable : désactivation idempotente, jamais de réactivation.
 * - `GET` (scanner de liens, client sans RFC 8058) : aucun effet, redirection vers la page de confirmation.
 * Seul ce chemin exact est exempté du contrôle d'Origin (cf. `src/lib/security/origin-check.ts`).
 */
import { Effect } from "effect";
import { AppConfig } from "@/lib/effect/config";
import { apiRoute } from "@/lib/effect/http";
import { asLocale } from "@/core/notifications/email-templates";
import { setNotificationPreference } from "@/core/notifications/service";
import { ONE_CLICK_BODY, unsubscribePageUrl, verifyUnsubscribeToken } from "@/core/notifications/unsubscribe";

export const prerender = false;

const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" };
const reply = (status: number, extra: Record<string, string> = {}) => new Response(null, { status, headers: { ...NO_STORE, ...extra } });

const trustedHost = (siteUrl: string, request: Request, url: URL) => {
  try {
    return new URL(siteUrl).host === (request.headers.get("host") ?? url.host).toLowerCase();
  } catch {
    return false;
  }
};

export const POST = apiRoute(({ request, url }) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    if (!trustedHost(config.siteUrl, request, url)) return reply(400);
    const contentType = (request.headers.get("content-type") ?? "").toLowerCase().split(";")[0]?.trim();
    if (contentType !== "application/x-www-form-urlencoded") return reply(415);
    const body = yield* Effect.tryPromise(() => request.text()).pipe(Effect.orElseSucceed(() => ""));
    if (body.trim() !== ONE_CLICK_BODY) return reply(400);
    const claims = verifyUnsubscribeToken(url.searchParams.get("token") ?? "", config.signingSecret);
    if (!claims || claims.channel !== "email") return reply(400);
    yield* setNotificationPreference(claims.userId, claims.category, "email", false);
    yield* Effect.logInfo("notifications.unsubscribe.one_click", { category: claims.category });
    return reply(200);
  }),
);

export const GET = apiRoute(({ request, url }) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    if (!trustedHost(config.siteUrl, request, url)) return reply(400);
    const token = url.searchParams.get("token") ?? "";
    if (token.length === 0 || token.length > 1024) return reply(400);
    return reply(303, { location: unsubscribePageUrl(config.siteUrl, asLocale(url.searchParams.get("lang")), token) });
  }),
);
