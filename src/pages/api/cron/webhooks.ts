/**
 * POST /api/cron/webhooks — relance les livraisons de webhooks dues
 * (backoff exponentiel persistant). À appeler chaque minute.
 */
import { Effect } from 'effect';
import { apiRoute, json } from '@/lib/effect/http';
import { requireCron } from '@/lib/effect/cron';
import { processDueDeliveries } from '@/modules/webhooks/domain/dispatcher';

export const prerender = false;
export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    yield* requireCron(request);
    const result = yield* processDueDeliveries(100);
    return json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  }),
);
