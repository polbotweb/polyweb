/** GET /api/health — sonde (HEALTH_TOKEN, sinon accès direct non proxifié uniquement). */
import { timingSafeEqual } from 'node:crypto';
import { access, constants } from 'node:fs/promises';
import { Effect } from 'effect';
import { checkConnection } from '@database/drizzle';
import { getCacheStats } from '@database/cache';
import { checkSmtpConfig } from '@/smtp/env';
import { apiRoute } from '@/lib/effect/http';
import { legacyJson } from '@/lib/effect/route';
import { Storage } from '@/lib/storage';
import { SearchIndex } from '@/lib/search';

export const prerender = false;

const startedAt = Date.now();
const HEALTH_TOKEN = process.env.HEALTH_TOKEN;
const NO_STORE = { 'Cache-Control': 'no-store' };

function isAuthorized(request: Request): boolean {
  // Sans jeton : seulement les sondes directes (conteneur), pas les requêtes proxifiées.
  if (!HEALTH_TOKEN) return !request.headers.get('x-forwarded-for');
  const bearer = request.headers.get('authorization');
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (token.length !== HEALTH_TOKEN.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(HEALTH_TOKEN));
}

const uptime = () => Math.floor((Date.now() - startedAt) / 1000);

const checks = Effect.gen(function* () {
  const storage = yield* Storage;
  const search = yield* SearchIndex;
  const [db, uploadsOk] = yield* Effect.all(
    [
      Effect.promise(() => checkConnection()).pipe(Effect.timeoutOrElse({ duration: '5 seconds', orElse: () => Effect.succeed({ ok: false, latency: -1 }) })),
      // Disque local seulement pertinent pour le pilote local.
      storage.driver === 'local' ? Effect.promise(() => access('public/uploads', constants.W_OK).then(() => true, () => false)) : Effect.succeed(true),
    ],
    { concurrency: 2 },
  );
  const smtp = checkSmtpConfig();
  const cache = getCacheStats();
  const allOk = db.ok && smtp.ok && uploadsOk;
  return legacyJson(
    {
      status: allOk ? 'ok' : 'degraded',
      version: '0.0.1',
      uptime: uptime(),
      timestamp: new Date().toISOString(),
      db: { ok: db.ok },
      smtp: { ok: smtp.ok, provider: smtp.provider },
      disk: { uploadsWritable: uploadsOk },
      storage: { driver: storage.driver },
      search: { driver: search.driver },
      cache: { size: cache.size, hits: cache.hits, misses: cache.misses },
    },
    allOk ? 200 : 503,
    NO_STORE,
  );
});

export const GET = apiRoute(({ request }) =>
  isAuthorized(request)
    ? checks.pipe(
        Effect.catchCause((cause) =>
          Effect.logError('[health] Check failed', cause).pipe(
            Effect.as(
              legacyJson(
                { status: 'error', version: '0.0.1', uptime: uptime(), timestamp: new Date().toISOString(), db: { ok: false }, smtp: { ok: false, provider: 'unknown' }, disk: { uploadsWritable: false } },
                503,
                NO_STORE,
              ),
            ),
          ),
        ),
      )
    : Effect.succeed(legacyJson({ error: 'Unauthorized' }, 401, NO_STORE)),
);
