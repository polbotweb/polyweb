/**
 * POST /api/cron/classifieds — expire les annonces échues et émet les relances
 * d'expiration (idempotentes). Authentifié par `CRON_SECRET`.
 */
import { Effect } from "effect";
import { apiRoute, json } from "@/lib/effect/http";
import { requireCron } from "@/lib/effect/cron";
import { expireDueAds, notifyExpiringAds } from "@/modules/classifieds/services/expire";

export const prerender = false;
export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    yield* requireCron(request);
    const expired = yield* expireDueAds();
    const expiring = yield* notifyExpiringAds();
    return json({ ok: true, expired, expiring }, { headers: { "cache-control": "no-store" } });
  }),
);
