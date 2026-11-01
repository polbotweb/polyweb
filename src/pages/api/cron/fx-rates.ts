/**
 * POST /api/cron/fx-rates — importe les taux de référence BCE du jour (core/fx, idempotent).
 * Quotidien, après la publication BCE (~16 h CET) : ex. 17:00 Europe/Paris, jours ouvrés.
 * Les forçages manuels (admin « Taux de change ») restent prioritaires à date égale.
 */
import { Effect } from 'effect';
import { apiRoute, json } from '@/lib/effect/http';
import { requireCron } from '@/lib/effect/cron';
import { fetchEcbRates } from '@/core/fx/service';

export const prerender = false;
export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    yield* requireCron(request);
    const result = yield* fetchEcbRates().pipe(
      Effect.map((r) => ({ ok: true as const, ...r })),
      Effect.catchTags({
        EcbFetchError: (e) => Effect.succeed({ ok: false as const, error: 'ecb_fetch', status: e.status ?? null }),
        EcbFeedError: (e) => Effect.succeed({ ok: false as const, error: 'ecb_feed', reason: e.reason }),
      }),
    );
    return json(result, { status: result.ok ? 200 : 502, headers: { 'cache-control': 'no-store' } });
  }),
);
