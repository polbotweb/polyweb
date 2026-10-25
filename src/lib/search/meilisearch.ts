/**
 * Pilote Meilisearch (brique k) — API HTTP via fetch, délais et reprises.
 *
 *   MEILISEARCH_HOST (ex. http://127.0.0.1:7700), MEILISEARCH_API_KEY,
 *   MEILISEARCH_INDEX (défaut « polyweb »), SEARCH_TIMEOUT_MS (défaut 5000)
 *
 * Les écritures Meilisearch sont asynchrones (tâches) : on attend la fin de
 * chaque tâche pour garantir « écrit puis trouvable ».
 */
import { Duration, Effect, Schedule } from 'effect';
import { HIGHLIGHT_TAGS, safeHighlight, SearchError, type SearchDocument, type SearchIndexShape, type SearchKind } from './search';

export interface MeiliSettings {
  readonly host: string;
  readonly apiKey?: string;
  readonly index: string;
  readonly timeoutMs: number;
}

interface MeiliDoc extends Omit<SearchDocument, 'publishedAt'> {
  readonly publishedAt: number | null;
}

const quote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function makeMeiliSearch(settings: MeiliSettings): SearchIndexShape {
  const base = settings.host.replace(/\/$/, '');
  const fail = (operation: string) => (cause: unknown) => new SearchError({ driver: 'meilisearch', operation, cause });

  const request = <T>(operation: string, method: string, path: string, body?: unknown) =>
    Effect.tryPromise({
      try: async (signal) => {
        const res = await fetch(`${base}${path}`, {
          method,
          signal: AbortSignal.any([signal, AbortSignal.timeout(settings.timeoutMs)]),
          headers: { 'content-type': 'application/json', ...(settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`), { status: res.status });
        return (text ? JSON.parse(text) : null) as T;
      },
      catch: fail(operation),
    }).pipe(
      // Reprises uniquement sur erreurs réseau / 5xx / 429.
      Effect.retry({
        schedule: Schedule.exponential(Duration.millis(100)),
        times: 2,
        while: (e) => {
          const status = (e.cause as { status?: number } | undefined)?.status;
          return status === undefined || status >= 500 || status === 429;
        },
      }),
    );

  const waitTask = (operation: string, task: { taskUid: number }) =>
    Effect.gen(function* () {
      const deadline = Date.now() + Math.max(settings.timeoutMs * 6, 30_000);
      let delay = 25;
      while (Date.now() < deadline) {
        const t = yield* request<{ status: string; error?: { message?: string } }>(operation, 'GET', `/tasks/${task.taskUid}`);
        if (t.status === 'succeeded') return;
        if (t.status === 'failed' || t.status === 'canceled') return yield* new SearchError({ driver: 'meilisearch', operation, cause: t.error?.message ?? t.status });
        yield* Effect.sleep(Duration.millis(delay));
        delay = Math.min(delay * 2, 500);
      }
      return yield* new SearchError({ driver: 'meilisearch', operation, cause: 'task timeout' });
    });

  const idx = `/indexes/${encodeURIComponent(settings.index)}`;
  let ready: Promise<void> | null = null;
  const ensureIndex = Effect.suspend(() => {
    ready ??= Effect.runPromise(
      Effect.gen(function* () {
        const created = yield* request<{ taskUid: number }>('create-index', 'POST', '/indexes', { uid: settings.index, primaryKey: 'id' });
        // « index_already_exists » est une tâche échouée mais acceptable.
        yield* Effect.ignore(waitTask('create-index', created));
        const task = yield* request<{ taskUid: number }>('settings', 'PATCH', `${idx}/settings`, {
          searchableAttributes: ['title', 'excerpt', 'body'],
          filterableAttributes: ['siteId', 'locale', 'kind', 'type'],
          sortableAttributes: ['publishedAt'],
        });
        yield* waitTask('settings', task);
      }),
    ).catch((e) => {
      ready = null;
      throw e;
    });
    return Effect.tryPromise({ try: () => ready!, catch: (e) => (e instanceof SearchError ? e : fail('ensure-index')(e)) });
  });

  const write = (operation: string, method: string, path: string, body: unknown) =>
    Effect.gen(function* () {
      yield* ensureIndex;
      const task = yield* request<{ taskUid: number }>(operation, method, path, body);
      yield* waitTask(operation, task);
    });

  return {
    driver: 'meilisearch',
    upsert: (docs) =>
      docs.length === 0
        ? Effect.void
        : write('upsert', 'POST', `${idx}/documents`, docs.map((d): MeiliDoc => ({ ...d, body: d.body.slice(0, 100_000), publishedAt: d.publishedAt ? Date.parse(d.publishedAt) : null }))),
    remove: (ids) => (ids.length === 0 ? Effect.void : write('remove', 'POST', `${idx}/documents/delete-batch`, [...ids])),
    clear: (siteId, kind?: SearchKind) =>
      write('clear', 'POST', `${idx}/documents/delete`, { filter: [`siteId = ${quote(siteId)}`, ...(kind ? [`kind = ${quote(kind)}`] : [])].join(' AND ') }),
    search: (q) =>
      Effect.gen(function* () {
        yield* ensureIndex;
        const filter = [`siteId = ${quote(q.siteId)}`, `locale = ${quote(q.locale)}`];
        if (q.kinds?.length) filter.push(`kind IN [${q.kinds.map(quote).join(', ')}]`);
        if (q.type) filter.push(`type = ${quote(q.type)}`);
        const res = yield* request<{
          estimatedTotalHits?: number;
          hits: Array<MeiliDoc & { _formatted?: { body?: string; excerpt?: string }; _rankingScore?: number }>;
        }>('search', 'POST', `${idx}/search`, {
          q: q.q,
          filter: filter.join(' AND '),
          limit: q.limit ?? 20,
          offset: q.offset ?? 0,
          attributesToCrop: ['body'],
          cropLength: 30,
          attributesToHighlight: ['excerpt', 'body'],
          highlightPreTag: HIGHLIGHT_TAGS.pre,
          highlightPostTag: HIGHLIGHT_TAGS.post,
          showRankingScore: true,
        });
        return {
          total: res.estimatedTotalHits ?? res.hits.length,
          hits: res.hits.map((h) => ({
            id: h.id,
            kind: h.kind,
            type: h.type,
            entityId: h.entityId,
            title: h.title,
            excerpt: h.excerpt,
            highlight: safeHighlight(h._formatted?.body || h._formatted?.excerpt || h.excerpt || ''),
            url: h.url,
            publishedAt: h.publishedAt ? new Date(h.publishedAt).toISOString() : null,
            score: h._rankingScore ?? 0,
          })),
        };
      }).pipe(Effect.withSpan('search.meilisearch')),
  };
}
