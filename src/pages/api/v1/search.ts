/**
 * GET /api/v1/search?q=&locale=&kind=&type=&limit=&offset=
 * Recherche plein texte du site (jeton search:read, ou anonyme limité).
 */
import { Effect } from 'effect';
import { apiRoute, json } from '@/lib/effect/http';
import { decode } from '@/lib/effect/schema';
import { SearchIndex, SearchQuery } from '@/lib/search';
import { apiRequest, corsHeaders, preflight } from '@/modules/api/domain/v1';
import { requireScope } from '@/modules/api/domain/tokens';
import { UpstreamError } from '@/lib/effect/errors';

export const prerender = false;
export const OPTIONS = preflight;
export const GET = apiRoute((ctx) =>
  Effect.gen(function* () {
    const { principal, site } = yield* apiRequest(ctx);
    if (principal.kind === 'token') yield* requireScope(principal, 'search:read');
    const p = ctx.url.searchParams;
    const kinds = p.getAll('kind').flatMap((k) => k.split(',')).filter(Boolean);
    const q = yield* decode(SearchQuery)({
      q: p.get('q') ?? '',
      siteId: site.id,
      locale: p.get("locale") ?? site.defaultLocale,
      ...(kinds.length ? { kinds } : {}),
      ...(p.get('type') ? { type: p.get('type') } : {}),
      limit: p.has('limit') ? Number(p.get('limit')) : 20,
      offset: p.has('offset') ? Number(p.get('offset')) : 0,
    });
    const search = yield* SearchIndex;
    const result = yield* search.search(q).pipe(Effect.mapError((e) => new UpstreamError({ service: `search:${e.driver}`, cause: e.cause })));
    return json(
      { query: q.q, locale: q.locale, driver: search.driver, total: result.total, results: result.hits },
      { headers: { ...corsHeaders(), 'cache-control': principal.kind === 'token' ? 'private, no-store' : 'public, max-age=30' } },
    );
  }),
);
