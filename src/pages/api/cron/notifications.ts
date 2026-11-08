/**
 * POST /api/cron/notifications — envoie les e-mails de notifications dus (`email_outbox`,
 * retries avec backoff persistant). À appeler chaque minute (Bearer `CRON_SECRET`).
 */
import { Effect } from 'effect';
import { apiRoute, json } from '@/lib/effect/http';
import { requireCron } from '@/lib/effect/cron';
import { processEmailOutbox } from '@/core/notifications/email-outbox';

export const prerender = false;
export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    yield* requireCron(request);
    const emails = yield* processEmailOutbox({ limit: 50 });
    return json({ ok: true, emails }, { headers: { 'cache-control': 'no-store' } });
  }),
);
