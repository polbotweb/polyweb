/**
 * POST /api/cron/payments-expire — expire les paiements en ligne échus et prévient les
 * modules propriétaires (ex. réservation en attente d'acompte → EXPIRED). Toutes les 5 min.
 */
import { Effect } from 'effect';
import { apiRoute, json } from '@/lib/effect/http';
import { requireCron } from '@/lib/effect/cron';
import { expireDuePayments, isPaymentsEnabled } from '@/core/payments';

export const prerender = false;
export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    yield* requireCron(request);
    if (!isPaymentsEnabled()) return json({ ok: true, expired: 0, skipped: 'disabled' }, { headers: { 'cache-control': 'no-store' } });
    const result = yield* expireDuePayments(new Date(), 100);
    return json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  }),
);
