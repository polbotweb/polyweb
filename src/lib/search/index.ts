/** Sélection du pilote de recherche depuis l'environnement (brique k). */
import { Effect, Layer } from 'effect';
import { AppConfig } from '@/lib/effect/config';
import { Db } from '@/lib/effect/db';
import { ConfigError } from '@/lib/effect/errors';
import { makePostgresSearch } from './postgres';
import { makeMeiliSearch, type MeiliSettings } from './meilisearch';
import { SearchIndex } from './search';

export * from './search';

export function meiliSettingsFromEnv(env: Readonly<Record<string, string | undefined>>): MeiliSettings | ConfigError {
  const host = env.MEILISEARCH_HOST?.trim();
  if (!host) return new ConfigError({ key: 'MEILISEARCH_HOST', reason: 'required when SEARCH_DRIVER=meilisearch' });
  return {
    host,
    apiKey: env.MEILISEARCH_API_KEY?.trim() || undefined,
    index: env.MEILISEARCH_INDEX?.trim() || 'polyweb',
    timeoutMs: Number(env.SEARCH_TIMEOUT_MS) > 0 ? Number(env.SEARCH_TIMEOUT_MS) : 5000,
  };
}

/** `pagefind` = recherche serveur Postgres + export statique Pagefind. */
export const searchDriverName = (env: Readonly<Record<string, string | undefined>>) => (env.SEARCH_DRIVER ?? 'postgres').toLowerCase();

export const SearchIndexLive = Layer.effect(
  SearchIndex,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const db = yield* Db;
    const driver = searchDriverName(config.env);
    if (driver === 'postgres' || driver === 'pagefind') return makePostgresSearch(db);
    if (driver === 'meilisearch') {
      const s = meiliSettingsFromEnv(config.env);
      if (s instanceof ConfigError) return yield* Effect.die(s);
      return makeMeiliSearch(s);
    }
    return yield* Effect.die(new ConfigError({ key: 'SEARCH_DRIVER', reason: `unknown driver "${driver}" (postgres | meilisearch | pagefind)` }));
  }),
);
