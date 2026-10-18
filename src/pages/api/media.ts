/** GET /api/media?type=avatar|logo|site — liste des médias (admin). */
import { Effect } from 'effect';
import { apiRoute } from '@/lib/effect/http';
import { legacyJson } from '@/lib/effect/route';
import { listMedia } from '@/media/list';
import { UPLOAD_DIRS, type UploadType } from '@/media/types';

export const prerender = false;
const VALID_TYPES = new Set(Object.keys(UPLOAD_DIRS));

export const GET = apiRoute((context) =>
  Effect.gen(function* () {
    const user = context.locals.user;
    if (!user || user.role !== 'admin') return legacyJson({ error: 'Unauthorized' }, 401);
    const typeParam = context.url.searchParams.get('type');
    const type = typeParam && VALID_TYPES.has(typeParam) ? (typeParam as UploadType) : undefined;
    const files = yield* listMedia(type);
    return legacyJson({ files, total: files.length }, 200, { 'Cache-Control': 'no-store' });
  }),
);
