/** GET /api/preview?id={pageId} — aperçu JSON d'une page CMS (admin). */
import { Effect } from 'effect';
import { getPagePreview } from '@database/loaders/page.loader';
import { logAuditEvent, extractIp } from '@/lib/audit';
import { apiRoute } from '@/lib/effect/http';
import { attempt, legacyJson, rateLimit, retryAfterSeconds } from '@/lib/effect/route';

export const prerender = false;

export const GET = apiRoute((context) =>
  Effect.gen(function* () {
    const user = context.locals.user;
    if (!user || user.role !== 'admin') return legacyJson({ error: 'Unauthorized' }, 401);
    const rl = yield* rateLimit(`preview:${user.id}`, { max: 30, window: 60 });
    if (!rl.allowed) return legacyJson({ error: 'Too many requests' }, 429, { 'Retry-After': retryAfterSeconds(rl) });
    const pageId = context.url.searchParams.get('id');
    if (!pageId) return legacyJson({ error: 'Missing id parameter' }, 400);
    const data = yield* attempt('page.preview', () => getPagePreview(pageId));
    if (!data) return legacyJson({ error: 'Page not found' }, 404);
    void logAuditEvent({
      userId: user.id,
      action: 'PAGE_PREVIEW',
      resource: 'page',
      resourceId: pageId,
      ipAddress: extractIp(context.request.headers, context.clientAddress),
      userAgent: context.request.headers.get('user-agent'),
    });
    return legacyJson(data, 200, { 'Cache-Control': 'no-store' });
  }),
);
