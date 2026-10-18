/** API CRUD générée (`pnpm api:generate`) : /api/crud/<ressource>[/<id>]. */
import { Effect } from 'effect';
import { getDrizzle } from '@database/drizzle';
import { handleCrud } from '@/core/crud/engine';
import { crudResources } from '@/generated/crud';
import { apiRoute } from '@/lib/effect/http';
import { attempt, rateLimit } from '@/lib/effect/route';
import { userCan } from '@/lib/platform/admin';

export const prerender = false;

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const handler = apiRoute(({ params, request, locals, clientAddress, url }) =>
  Effect.gen(function* () {
    const [resourceId, id, ...rest] = (params.path ?? '').split('/').filter(Boolean);
    const registration = resourceId ? crudResources[resourceId] : undefined;
    if (!registration || rest.length > 0) return json({ error: 'NOT_FOUND' }, 404);

    const rl = yield* rateLimit(`crud_${clientAddress}`, { window: 60, max: 120 });
    if (!rl.allowed) return json({ error: 'RATE_LIMITED' }, 429);

    let body: unknown;
    if (request.method === 'POST' || request.method === 'PATCH' || request.method === 'PUT') {
      if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'UNSUPPORTED_MEDIA_TYPE' }, 415);
      const parsed = yield* Effect.tryPromise(() => request.json() as Promise<unknown>).pipe(Effect.option);
      if (parsed._tag === 'None') return json({ error: 'INVALID_JSON' }, 400);
      body = parsed.value;
    }

    const user = locals.user;
    const result = yield* attempt('crud.handle', () =>
      handleCrud(
        registration,
        {
          method: request.method,
          id: id ?? null,
          searchParams: url.searchParams,
          body,
          actor: user ? { id: user.id, role: user.role, banned: user.banned } : null,
          hasPermission: async (resource, action) => (user ? userCan(user.id, { [resource]: [action] }) : false),
        },
        getDrizzle(),
      ),
    );
    return result.status === 204 ? new Response(null, { status: 204 }) : json(result.body, result.status);
  }),
);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
