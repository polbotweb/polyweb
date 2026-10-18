/** Indexation (brique k) : réindexation complète et mises à jour sur événements. */
import { Effect } from 'effect';
import { inArray } from 'drizzle-orm';
import { schema } from '@database/drizzle';
import { DEFAULT_SITE_ID } from '@database/schemas/content.schema';
import { query } from '@/lib/effect/db';
import { onEvent, type PolywebEvent } from '@/core/events';
import { appRuntime } from '@/lib/effect/runtime';
import { LOCALES } from '@i18n/config';
import { documentId, SearchIndex, SEARCH_KINDS, type SearchDocument } from './search';
import { contentDocumentsForSite, contentEntryDocuments, legacyDocuments } from './sources';

/** Réindexe un site (ou tous) : vide puis réécrit. Retourne le nombre de documents par site. */
export const reindex = (siteIds?: readonly string[]) =>
  Effect.gen(function* () {
    const search = yield* SearchIndex;
    const sites = yield* query('search.sites', (db) =>
      siteIds?.length ? db.select({ id: schema.sites.id }).from(schema.sites).where(inArray(schema.sites.id, [...siteIds])) : db.select({ id: schema.sites.id }).from(schema.sites),
    );
    const legacy = sites.some((s) => s.id === DEFAULT_SITE_ID) ? yield* legacyDocuments : [];
    const counts: Record<string, number> = {};
    for (const site of sites) {
      const docs: SearchDocument[] = [...(yield* contentDocumentsForSite(site.id)), ...(site.id === DEFAULT_SITE_ID ? legacy : [])];
      yield* search.clear(site.id);
      yield* search.upsert(docs);
      counts[site.id] = docs.length;
    }
    return counts;
  }).pipe(Effect.withSpan('search.reindex'));

/** Met à jour une entrée : réécrit ses traductions publiées et supprime les autres. */
export const syncEntry = (entryId: string) =>
  Effect.gen(function* () {
    const search = yield* SearchIndex;
    const docs = yield* contentEntryDocuments(entryId);
    const keep = new Set(docs.map((d) => d.id));
    const stale = LOCALES.map((l) => documentId('content', entryId, l)).filter((id) => !keep.has(id));
    yield* search.remove(stale);
    yield* search.upsert(docs);
  });

export const handleSearchEvent = (event: PolywebEvent) =>
  Effect.gen(function* () {
    const entryId = (event.payload as { entryId?: unknown }).entryId;
    if (typeof entryId !== 'string') return;
    if (event.name === 'content.deleted') {
      const search = yield* SearchIndex;
      yield* search.remove(LOCALES.map((l) => documentId('content', entryId, l)));
    } else {
      yield* syncEntry(entryId);
    }
  });

let registered = false;
/** Abonne l'index aux événements de contenu (SEARCH_AUTO_INDEX=false pour désactiver). */
export function registerSearchIndexer(): void {
  if (registered || process.env.SEARCH_AUTO_INDEX === 'false') return;
  registered = true;
  for (const name of ['content.created', 'content.updated', 'content.published', 'content.unpublished', 'content.deleted'] as const) {
    onEvent(name, (event) =>
      appRuntime.runPromise(
        handleSearchEvent(event).pipe(
          Effect.timeout('20 seconds'),
          Effect.catchCause((cause) => Effect.logWarning(`[search] indexation échouée pour ${event.name}`, cause)),
        ),
      ),
    );
  }
}
export { SEARCH_KINDS };
