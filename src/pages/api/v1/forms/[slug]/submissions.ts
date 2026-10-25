/** GET /api/v1/forms/{slug}/submissions — scope forms:read. */
import { Effect } from 'effect';
import { apiRoute, json } from '@/lib/effect/http';
import { apiRequest, preflight } from '@/modules/api/domain/v1';
import { requireScope } from '@/modules/api/domain/tokens';
import { getForm, listSubmissions } from '@/modules/forms/domain/forms';

export const prerender = false;
export const OPTIONS = preflight;
export const GET = apiRoute((ctx) =>
  Effect.gen(function* () {
    const { principal, site } = yield* apiRequest(ctx);
    yield* requireScope(principal, 'forms:read');
    const form = yield* getForm(site.id, ctx.params.slug ?? '');
    const limit = Math.min(Math.max(Number(ctx.url.searchParams.get('limit')) || 50, 1), 500);
    const page = Math.max(Number(ctx.url.searchParams.get('page')) || 1, 1);
    const { items, total } = yield* listSubmissions(form.id, { limit, offset: (page - 1) * limit });
    return json({
      data: items.map((s) => ({ id: s.id, data: s.data, locale: s.locale, status: s.status, createdAt: s.createdAt.toISOString() })),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    }, { headers: { 'cache-control': 'private, no-store' } });
  }),
);
