/**
 * pnpm search:reindex [--site <slug>]
 * Réindexe le pilote de recherche configuré (SEARCH_DRIVER) depuis la base.
 */
import 'dotenv/config';
import { Effect } from 'effect';
import { eq } from 'drizzle-orm';
import { schema } from '@database/drizzle';
import { appRuntime } from '@/lib/effect/runtime';
import { query } from '@/lib/effect/db';
import { NotFoundError } from '@/lib/effect/errors';
import { SearchIndex } from '@/lib/search';
import { reindex } from '@/lib/search/indexer';

const slugArg = process.argv.includes('--site') ? process.argv[process.argv.indexOf('--site') + 1] : undefined;

const program = Effect.gen(function* () {
  const search = yield* SearchIndex;
  let ids: string[] | undefined;
  if (slugArg) {
    const [site] = yield* query('sites.bySlug', (db) => db.select({ id: schema.sites.id }).from(schema.sites).where(eq(schema.sites.slug, slugArg)));
    if (!site) return yield* new NotFoundError({ entity: 'site', id: slugArg });
    ids = [site.id];
  }
  const counts = yield* reindex(ids);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  yield* Effect.log(`[search:reindex] pilote=${search.driver} sites=${Object.keys(counts).length} documents=${total}`);
});

appRuntime
  .runPromise(program)
  .then(() => appRuntime.dispose())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('[search:reindex] échec :', e);
    await appRuntime.dispose();
    process.exit(1);
  });
