/**
 * POST /api/cron/banking — tâche banking horaire (chaque tenant s'exécute à son heure réglée,
 * Europe/Paris) : flux et versements (si activés), rapprochement automatique, ancienneté, résumé,
 * purge des fichiers bruts au-delà de la conservation. Idempotent par jour.
 */
import { apiRoute, json } from '@/lib/effect/http';
import { requireCron } from '@/lib/effect/cron';
import { Effect } from 'effect';
import { runBankingCron } from '@/modules/banking/services/cron.service';

export const prerender = false;
export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    yield* requireCron(request);
    const result = yield* runBankingCron();
    return json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  }),
);
