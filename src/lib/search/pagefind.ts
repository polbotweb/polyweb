/**
 * Export Pagefind (brique k) : index statique consommé côté navigateur
 * (`/pagefind/pagefind.js`). Construit à partir des mêmes sources que les
 * pilotes serveur, sans dépendre du HTML rendu (site SSR).
 */
import { Effect } from 'effect';
import { SearchError, type SearchDocument } from './search';

export const writePagefindIndex = (docs: readonly SearchDocument[], outputPath: string) =>
  Effect.gen(function* () {
    const fail = (operation: string) => (cause: unknown) => new SearchError({ driver: 'pagefind', operation, cause });
    const pagefind = yield* Effect.tryPromise({ try: () => import('pagefind'), catch: fail('import') });
    const { index, errors } = yield* Effect.tryPromise({ try: () => pagefind.createIndex({}), catch: fail('create') });
    if (!index) return yield* new SearchError({ driver: 'pagefind', operation: 'create', cause: errors });
    yield* Effect.addFinalizer(() => Effect.promise(() => pagefind.close()));
    let added = 0;
    for (const d of docs) {
      const r = yield* Effect.tryPromise({
        try: () =>
          index.addCustomRecord({
            url: d.url,
            content: [d.excerpt, d.body].filter(Boolean).join('\n') || d.title,
            language: d.locale,
            meta: { title: d.title, ...(d.excerpt ? { excerpt: d.excerpt.slice(0, 300) } : {}) },
            filters: { kind: [d.kind], ...(d.type ? { type: [d.type] } : {}) },
          }),
        catch: fail('add'),
      });
      if (r.errors.length) return yield* new SearchError({ driver: 'pagefind', operation: 'add', cause: r.errors });
      added++;
    }
    const w = yield* Effect.tryPromise({ try: () => index.writeFiles({ outputPath }), catch: fail('write') });
    if (w.errors.length) return yield* new SearchError({ driver: 'pagefind', operation: 'write', cause: w.errors });
    return { added, outputPath: w.outputPath };
  }).pipe(Effect.scoped);
