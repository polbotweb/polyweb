/**
 * Routes génériques de l'API publique : `/api/v1/{resource}[/{id}[/{action}]]`.
 *
 * Tout passe par le registre (`core/api/registry`) : authentification, scope
 * de la ressource, tenant = site de la clé + son organisation. Une ressource
 * d'un autre tenant répond 404 (jamais 403) pour ne pas révéler son existence.
 */
import type { APIContext } from 'astro';
import { Effect } from 'effect';
import { json } from '@/lib/effect/http';
import { NotFoundError, UnauthorizedError, ValidationError } from '@/lib/effect/errors';
import { readJson } from '@/lib/effect/schema';
import { getApiResource } from '@/core/api/registry';
import { decodeCursor, encodeCursor } from '@/core/api/cursor';
import { requestFingerprint, withIdempotency } from '@/core/api/idempotency';
import type { ApiEffect, ApiResourceDefinition, ApiTenant } from '@/core/api/contract';
import { apiRequest, withCors } from './v1';
import { requireScope } from './tokens';

const MAX_LIMIT = 100;

interface WriteResult {
  status: number;
  body: unknown;
  location: string | null;
}
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const resolve = (ctx: APIContext, write: boolean) =>
  Effect.gen(function* () {
    const name = ctx.params.resource ?? '';
    const resource = getApiResource(name);
    if (!resource) return yield* new NotFoundError({ entity: 'ApiResource', id: name });
    const req = yield* apiRequest(ctx);
    const scope = write ? resource.writeScope : resource.scope;
    if (!scope) return yield* new NotFoundError({ entity: 'ApiOperation', id: `write ${name}` });
    yield* requireScope(req.principal, scope);
    const tenant: ApiTenant = { siteId: req.site.id, organizationId: req.site.organizationId ?? null };
    return { resource, tenant, ...req };
  });

const idParam = (ctx: APIContext) =>
  Effect.suspend(() => {
    const id = ctx.params.id ?? '';
    return ID.test(id) ? Effect.succeed(id) : Effect.fail(new NotFoundError({ entity: 'Resource', id: id.slice(0, 64) }));
  });

const notFound = (resource: ApiResourceDefinition, id: string) => new NotFoundError({ entity: resource.name, id });

export const listResourceHandler = (ctx: APIContext) =>
  Effect.gen(function* () {
    const { resource, tenant, limit: rate } = yield* resolve(ctx, false);
    const params = ctx.url.searchParams;
    const rawLimit = params.get('limit');
    const limit = rawLimit === null ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return yield* new ValidationError({ issues: [{ path: 'limit', message: `Integer between 1 and ${MAX_LIMIT}` }] });
    }
    const cursor = decodeCursor(params.get('cursor'));
    if (cursor === undefined) return yield* new ValidationError({ issues: [{ path: 'cursor', message: 'Invalid cursor' }] });
    const filters: Record<string, string> = {};
    for (const f of resource.filters) {
      const v = params.get(f.name);
      if (v === null) continue;
      if (v.length > 200 || (f.values && !f.values.includes(v))) {
        return yield* new ValidationError({ issues: [{ path: f.name, message: f.values ? `One of ${f.values.join(', ')}` : 'Too long' }] });
      }
      filters[f.name] = v;
    }
    const page = yield* resource.list(tenant, { limit, cursor, filters });
    return withCors(json({ data: page.items, meta: { limit, nextCursor: page.last ? encodeCursor(page.last) : null } }), rate);
  });

export const getResourceHandler = (ctx: APIContext) =>
  Effect.gen(function* () {
    const { resource, tenant, limit } = yield* resolve(ctx, false);
    const id = yield* idParam(ctx);
    const item = yield* resource.get(tenant, id);
    if (item === undefined) return yield* notFound(resource, id);
    return withCors(json({ data: item }), limit);
  });

/** Exécute une écriture sous Idempotency-Key ; rejoue la réponse stockée le cas échéant. */
const idempotentWrite = (
  ctx: APIContext,
  tokenId: string | null,
  run: (body: unknown) => ApiEffect<WriteResult>,
) =>
  Effect.gen(function* () {
    if (!tokenId) return yield* new UnauthorizedError({ reason: 'API token required' });
    const raw = yield* Effect.promise(() => ctx.request.text());
    let body: unknown = {};
    if (raw.trim()) body = yield* readJson(new Request('http://x', { method: 'POST', body: raw }));
    const key = ctx.request.headers.get('idempotency-key');
    return yield* withIdempotency(tokenId, key, requestFingerprint(ctx.request.method, ctx.url.pathname, raw), run(body));
  });

const writeResponse = (r: { status: number; body: unknown; location: string | null; replayed: boolean }) => {
  const headers: Record<string, string> = {};
  if (r.location) headers.location = r.location;
  if (r.replayed) headers['idempotent-replayed'] = 'true';
  return json(r.body, { status: r.status, headers });
};

export const createResourceHandler = (ctx: APIContext) =>
  Effect.gen(function* () {
    const { resource, tenant, principal, limit } = yield* resolve(ctx, true);
    const create = resource.create;
    if (!create) return yield* new NotFoundError({ entity: 'ApiOperation', id: `create ${resource.name}` });
    const r = yield* idempotentWrite(ctx, principal.tokenId, (body) =>
      create(tenant, body).pipe(
        Effect.map((item): WriteResult => ({ status: 201, body: { data: item }, location: `/api/v1/${resource.name}/${(item as { id: string }).id}` })),
      ),
    );
    return withCors(writeResponse(r), limit);
  });

export const updateResourceHandler = (ctx: APIContext) =>
  Effect.gen(function* () {
    const { resource, tenant, principal, limit } = yield* resolve(ctx, true);
    const update = resource.update;
    if (!update) return yield* new NotFoundError({ entity: 'ApiOperation', id: `update ${resource.name}` });
    const id = yield* idParam(ctx);
    const r = yield* idempotentWrite(ctx, principal.tokenId, (body) =>
      update(tenant, id, body).pipe(
        Effect.flatMap((item) => (item === undefined ? Effect.fail(notFound(resource, id)) : Effect.succeed<WriteResult>({ status: 200, body: { data: item }, location: null }))),
      ),
    );
    return withCors(writeResponse(r), limit);
  });

export const actionResourceHandler = (ctx: APIContext) =>
  Effect.gen(function* () {
    const { resource, tenant, principal, limit } = yield* resolve(ctx, true);
    const action = resource.actions?.find((a) => a.name === ctx.params.action);
    if (!action) return yield* new NotFoundError({ entity: 'ApiAction', id: String(ctx.params.action ?? '').slice(0, 64) });
    const id = yield* idParam(ctx);
    const r = yield* idempotentWrite(ctx, principal.tokenId, (body) =>
      action.run(tenant, id, body).pipe(Effect.map((item): WriteResult => ({ status: 200, body: { data: item }, location: null }))),
    );
    return withCors(writeResponse(r), limit);
  });
