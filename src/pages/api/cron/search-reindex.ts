/** POST /api/cron/search-reindex — réindexation complète (CRON_SECRET). */
import { Effect } from 'effect';
import { apiRoute, json } from '@/lib/effect/http';
import { requireCron } from '@/lib/effect/cron';
import { reindex } from '@/lib/search/indexer';

export const prerender = false;
export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    yield* requireCron(request);
    const counts = yield* reindex();
    return json({ ok: true, sites: Object.keys(counts).length, documents: Object.values(counts).reduce((a, b) => a + b, 0) }, { headers: { 'cache-control': 'no-store' } });
  }),
);
