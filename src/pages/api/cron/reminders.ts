/**
 * POST /api/cron/reminders — exécute les sources de relances des modules (N6-A ; d'abord les
 * relances de factures échues). Idempotent : à appeler une fois par jour (Bearer `CRON_SECRET`).
 * Les e-mails produits passent par `email_outbox`, envoyée par `/api/cron/notifications`.
 */
import { Effect } from 'effect';
import { apiRoute, json } from '@/lib/effect/http';
import { requireCron } from '@/lib/effect/cron';
import { runReminders } from '@/core/notifications/reminders';

export const prerender = false;
export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    yield* requireCron(request);
    const reminders = yield* runReminders();
    return json({ ok: true, reminders }, { headers: { 'cache-control': 'no-store' } });
  }),
);
