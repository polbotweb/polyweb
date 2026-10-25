/** Pilote Postgres (brique k) : table search_documents + tsvector pondéré. */
import { Effect } from 'effect';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { schema } from '@database/drizzle';
import type { DbShape } from '@/lib/effect/db';
import { buildTsQuery, getRegconfig } from '@/core/search/postgres';
import { HIGHLIGHT_TAGS, safeHighlight, SearchError, type SearchDocument, type SearchIndexShape, type SearchKind } from './search';

const REGCONFIGS = new Set(['french', 'english', 'spanish', 'simple']);
const cfg = (locale: string) => {
  const c = getRegconfig(locale);
  return sql.raw(`'${REGCONFIGS.has(c) ? c : 'simple'}'::regconfig`);
};

export function makePostgresSearch(db: DbShape): SearchIndexShape {
  const fail = (operation: string) => (cause: unknown) => new SearchError({ driver: 'postgres', operation, cause });

  const upsert = (docs: readonly SearchDocument[]) =>
    Effect.forEach(
      chunk(docs, 200),
      (batch) =>
        db
          .query('search.upsert', (d) =>
            d
              .insert(schema.searchDocuments)
              .values(
                batch.map((doc) => ({
                  id: doc.id,
                  siteId: doc.siteId,
                  kind: doc.kind,
                  type: doc.type,
                  entityId: doc.entityId,
                  locale: doc.locale,
                  title: doc.title,
                  excerpt: doc.excerpt,
                  body: doc.body.slice(0, 200_000),
                  url: doc.url,
                  publishedAt: doc.publishedAt ? new Date(doc.publishedAt) : null,
                  tsv: sql`setweight(to_tsvector(${cfg(doc.locale)}, ${doc.title}), 'A') || setweight(to_tsvector(${cfg(doc.locale)}, ${doc.excerpt ?? ''}), 'B') || setweight(to_tsvector(${cfg(doc.locale)}, ${doc.body.slice(0, 200_000)}), 'C')` as unknown as string,
                  updatedAt: new Date(),
                })),
              )
              .onConflictDoUpdate({
                target: schema.searchDocuments.id,
                set: {
                  siteId: sql`excluded.site_id`,
                  kind: sql`excluded.kind`,
                  type: sql`excluded.type`,
                  entityId: sql`excluded.entity_id`,
                  locale: sql`excluded.locale`,
                  title: sql`excluded.title`,
                  excerpt: sql`excluded.excerpt`,
                  body: sql`excluded.body`,
                  url: sql`excluded.url`,
                  publishedAt: sql`excluded.published_at`,
                  tsv: sql`excluded.tsv`,
                  updatedAt: sql`excluded.updated_at`,
                },
              }),
          )
          .pipe(Effect.mapError(fail('upsert'))),
      { discard: true },
    );

  return {
    driver: 'postgres',
    upsert,
    remove: (ids) =>
      ids.length === 0
        ? Effect.void
        : db.query('search.remove', (d) => d.delete(schema.searchDocuments).where(inArray(schema.searchDocuments.id, [...ids]))).pipe(Effect.asVoid, Effect.mapError(fail('remove'))),
    clear: (siteId, kind?: SearchKind) =>
      db
        .query('search.clear', (d) =>
          d.delete(schema.searchDocuments).where(kind ? and(eq(schema.searchDocuments.siteId, siteId), eq(schema.searchDocuments.kind, kind)) : eq(schema.searchDocuments.siteId, siteId)),
        )
        .pipe(Effect.asVoid, Effect.mapError(fail('clear'))),
    search: (q) =>
      Effect.gen(function* () {
        const tsq = buildTsQuery(q.q);
        if (!tsq) return { total: 0, hits: [] };
        const c = cfg(q.locale);
        const filters = [sql`site_id = ${q.siteId}`, sql`locale = ${q.locale}`, sql`tsv @@ to_tsquery(${c}, ${tsq})`];
        if (q.kinds?.length) filters.push(sql`kind IN (${sql.join(q.kinds.map((k) => sql`${k}`), sql`, `)})`);
        if (q.type) filters.push(sql`type = ${q.type}`);
        const where = sql.join(filters, sql` AND `);
        const opts = `StartSel=${HIGHLIGHT_TAGS.pre}, StopSel=${HIGHLIGHT_TAGS.post}, MaxWords=30, MinWords=10, MaxFragments=2`;
        const [rows, count] = yield* Effect.all(
          [
            db.query('search.query', (d) =>
              d.execute<{ id: string; kind: SearchKind; type: string | null; entity_id: string; title: string; excerpt: string | null; url: string; published_at: Date | string | null; rank: number; headline: string }>(sql`
                SELECT id, kind, type, entity_id, title, excerpt, url, published_at,
                  ts_rank_cd(tsv, to_tsquery(${c}, ${tsq})) AS rank,
                  ts_headline(${c}, coalesce(nullif(excerpt, ''), '') || ' ' || left(body, 5000), to_tsquery(${c}, ${tsq}), ${opts}) AS headline
                FROM search_documents WHERE ${where}
                ORDER BY rank DESC, published_at DESC NULLS LAST
                LIMIT ${q.limit ?? 20} OFFSET ${q.offset ?? 0}`),
            ),
            db.query('search.count', (d) => d.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM search_documents WHERE ${where}`)),
          ],
          { concurrency: 2 },
        ).pipe(Effect.mapError(fail('search')));
        return {
          total: count.rows[0]?.n ?? 0,
          hits: rows.rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            type: r.type,
            entityId: r.entity_id,
            title: r.title,
            excerpt: r.excerpt,
            highlight: safeHighlight(r.headline.trim()),
            url: r.url,
            publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
            score: Number(r.rank),
          })),
        };
      }).pipe(Effect.withSpan('search.postgres')),
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
