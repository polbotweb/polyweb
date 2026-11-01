/**
 * POST /api/cron/webhooks — relance les livraisons de webhooks dues
 * (backoff exponentiel persistant) et reprend l'outbox d'événements non diffusés.
 * À appeler chaque minute.
 */
import { Effect } from 'effect';
import { apiRoute, json } from '@/lib/effect/http';
import { requireCron } from '@/lib/effect/cron';
import { processOutbox } from '@/core/events/outbox';
import { processDueDeliveries } from '@/modules/webhooks/domain/dispatcher';

export const prerender = false;
export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    yield* requireCron(request);
    const outbox = yield* processOutbox(100);
    const result = yield* processDueDeliveries(100);
    return json({ ok: true, ...outbox, ...result }, { headers: { 'cache-control': 'no-store' } });
  }),
);
