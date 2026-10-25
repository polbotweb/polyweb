/**
 * API REST v1 (brique c) — logique des endpoints, en Effect.
 * Les fichiers `src/pages/api/v1/**` ne font qu'appeler `apiRoute(...)`.
 */
import type { APIContext } from 'astro';
import { Effect, Schema } from 'effect';
import { json } from '@/lib/effect/http';
import { NotFoundError } from '@/lib/effect/errors';
import { decode, readJson } from '@/lib/effect/schema';
import { AppConfig } from '@/lib/effect/config';
import * as Content from '@/modules/content/domain/content.effect';
import { pickTranslation, type FullEntry } from '@/modules/content/domain/entries';
import type { ContentType } from '@/modules/content/domain/content-types';
import { getSiteByIdEffect } from '@/modules/sites/domain/sites';
import { DEFAULT_SITE_ID } from '@database/schemas/content.schema';
import { authenticate, hasScope, rateLimit, requireScope, type ApiPrincipal } from './tokens';
import { buildOpenApiDocument } from './openapi';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': process.env.API_CORS_ORIGINS?.trim() || '*',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

export const preflight = () => new Response(null, { status: 204, headers: corsHeaders() });

const withCors = (res: Response) => {
  for (const [k, v] of Object.entries(corsHeaders())) res.headers.set(k, v);
  return res;
};

function clientIp(ctx: APIContext): string {
  try {
    return ctx.clientAddress;
  } catch {
    return 'unknown';
  }
}

/** Authentifie + limite le débit + charge le site du principal. */
export const apiRequest = (ctx: APIContext) =>
  Effect.gen(function* () {
    const fallbackSite = ctx.locals.site?.id ?? DEFAULT_SITE_ID;
    const principal = yield* authenticate(ctx.request.headers.get('authorization'), fallbackSite);
    const limit = yield* rateLimit(principal, clientIp(ctx));
    const site = yield* getSiteByIdEffect(principal.siteId);
    if (!site) return yield* new NotFoundError({ entity: 'Site', id: principal.siteId });
    return { principal, site, limit };
  });

/** Un type est visible si public, ou si le jeton a content:read / content:write. */
const visibleType = (type: ContentType, p: ApiPrincipal) =>
  type.settings.publicRead || hasScope(p, 'content:read') || hasScope(p, 'content:write');

const findVisibleType = (siteId: string, slug: string, p: ApiPrincipal) =>
  Effect.flatMap(Content.findType(siteId, slug), (t) =>
    visibleType(t, p) ? Effect.succeed(t) : Effect.fail(new NotFoundError({ entity: 'ContentType', id: slug })),
  );

export function serializeEntry(entry: FullEntry, locale?: string, fallbackLocale = 'fr') {
  const base = {
    id: entry.id,
    type: entry.type.slug,
    slug: entry.slug,
    status: entry.status,
    version: entry.version,
    publishedAt: entry.publishedAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    data: entry.sharedData,
  };
  if (locale) {
    const t = pickTranslation(entry, locale, fallbackLocale);
    return {
      ...base,
      locale: t?.locale ?? null,
      title: t?.title ?? null,
      data: { ...entry.sharedData, ...(t?.data ?? {}) },
      blocks: t?.blocks ?? null,
      seo: t?.seo ?? {},
      availableLocales: entry.translations.map((x) => x.locale),
    };
  }
  return {
    ...base,
    translations: Object.fromEntries(
      entry.translations.map((t) => [t.locale, { title: t.title, data: t.data, blocks: t.blocks, seo: t.seo }]),
    ),
  };
}

const ListQuery = Schema.Struct({
  page: Schema.optional(Schema.NumberFromString.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)))),
  limit: Schema.optional(Schema.NumberFromString.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 100 })))),
  q: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(200)))),
  locale: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(8)))),
  status: Schema.optional(Schema.Literals(['published', 'draft', 'archived', 'any'])),
});

const TranslationBody = Schema.Struct({
  title: Schema.String,
  data: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  blocks: Schema.optional(Schema.Unknown),
  seo: Schema.optional(
    Schema.Struct({
      metaTitle: Schema.optional(Schema.String),
      metaDescription: Schema.optional(Schema.String),
      ogImage: Schema.optional(Schema.String),
      noindex: Schema.optional(Schema.Boolean),
    }),
  ),
});

export const EntryBody = Schema.Struct({
  slug: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Literals(['draft', 'published'])),
  data: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  translations: Schema.Record(Schema.String, TranslationBody),
  message: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(300)))),
  expectedVersion: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt()))),
});

const queryRecord = (url: URL) => Object.fromEntries(url.searchParams.entries());

// ─── Handlers ────────────────────────────────────────────────────────

export const listContentTypesHandler = (ctx: APIContext) =>
  Effect.gen(function* () {
    const { principal, site } = yield* apiRequest(ctx);
    const types = yield* Content.listTypes(site.id);
    return withCors(
      json({
        data: types
          .filter((t) => visibleType(t, principal))
          .map((t) => ({ slug: t.slug, name: t.name, description: t.description, fields: t.fields, settings: t.settings })),
      }),
    );
  });

export const listEntriesHandler = (ctx: APIContext) =>
  Effect.gen(function* () {
    const { principal, site } = yield* apiRequest(ctx);
    const type = yield* findVisibleType(site.id, ctx.params.type ?? '', principal);
    const q = yield* decode(ListQuery)(queryRecord(ctx.url));
    const status = q.status ?? 'published';
    if (status !== 'published') yield* requireScope(principal, 'content:write');
    const limit = q.limit ?? 20;
    const page = q.page ?? 1;
    const { items, total } = yield* Content.list(type, { status, limit, offset: (page - 1) * limit, search: q.q });
    return withCors(
      json(
        {
          data: items.map((e) => serializeEntry(e, q.locale, site.defaultLocale)),
          meta: { page, limit, total, pages: Math.ceil(total / limit) },
        },
        { headers: status === 'published' && principal.kind === 'anonymous' ? { 'cache-control': 'public, max-age=60' } : { 'cache-control': 'private, no-store' } },
      ),
    );
  });

const findByRef = (type: ContentType, ref: string, includeDrafts: boolean) =>
  UUID.test(ref)
    ? Effect.flatMap(Content.findEntry(type, ref), (e) =>
        includeDrafts || e.status === 'published' ? Effect.succeed(e) : Effect.fail(new NotFoundError({ entity: 'Entry', id: ref })),
      )
    : Content.findBySlug(type, ref, { includeDrafts });

export const getEntryHandler = (ctx: APIContext) =>
  Effect.gen(function* () {
    const { principal, site } = yield* apiRequest(ctx);
    const type = yield* findVisibleType(site.id, ctx.params.type ?? '', principal);
    const locale = ctx.url.searchParams.get('locale') ?? undefined;
    const entry = yield* findByRef(type, ctx.params.ref ?? '', hasScope(principal, 'content:write'));
    return withCors(json({ data: serializeEntry(entry, locale, site.defaultLocale) }));
  });

const toSaveInput = (body: typeof EntryBody.Type) => ({
  slug: body.slug,
  sharedData: body.data as Record<string, unknown> | undefined,
  translations: body.translations as never,
  message: body.message ?? 'API v1',
});

export const createEntryHandler = (ctx: APIContext) =>
  Effect.gen(function* () {
    const { principal, site } = yield* apiRequest(ctx);
    yield* requireScope(principal, 'content:write');
    const type = yield* Content.findType(site.id, ctx.params.type ?? '');
    const body = yield* Effect.flatMap(readJson(ctx.request), decode(EntryBody));
    const created = yield* Content.create(type, toSaveInput(body), { authorId: null, allowedLocales: site.locales });
    if (body.status === 'published') yield* Content.setStatus(type, created.id, 'published', null);
    const full = yield* Content.findEntry(type, created.id);
    return withCors(json({ data: serializeEntry(full) }, { status: 201, headers: { location: `${ctx.url.pathname}/${created.id}` } }));
  });

export const updateEntryHandler = (ctx: APIContext) =>
  Effect.gen(function* () {
    const { principal, site } = yield* apiRequest(ctx);
    yield* requireScope(principal, 'content:write');
    const type = yield* Content.findType(site.id, ctx.params.type ?? '');
    const existing = yield* findByRef(type, ctx.params.ref ?? '', true);
    const body = yield* Effect.flatMap(readJson(ctx.request), decode(EntryBody));
    yield* Content.update(type, existing.id, toSaveInput(body), {
      authorId: null,
      allowedLocales: site.locales,
      expectedVersion: body.expectedVersion,
    });
    if (body.status && body.status !== existing.status) yield* Content.setStatus(type, existing.id, body.status, null);
    const full = yield* Content.findEntry(type, existing.id);
    return withCors(json({ data: serializeEntry(full) }));
  });

export const deleteEntryHandler = (ctx: APIContext) =>
  Effect.gen(function* () {
    const { principal, site } = yield* apiRequest(ctx);
    yield* requireScope(principal, 'content:write');
    const type = yield* Content.findType(site.id, ctx.params.type ?? '');
    const existing = yield* findByRef(type, ctx.params.ref ?? '', true);
    yield* Content.remove(type, existing.id);
    return withCors(new Response(null, { status: 204 }));
  });

export const openApiHandler = (ctx: APIContext) =>
  Effect.gen(function* () {
    const { principal, site } = yield* apiRequest(ctx);
    const config = yield* AppConfig;
    const types = (yield* Content.listTypes(site.id)).filter((t) => visibleType(t, principal));
    return withCors(
      json(
        buildOpenApiDocument({ baseUrl: ctx.url.origin || config.siteUrl, siteName: site.name, locales: site.locales, types }),
        { headers: { 'cache-control': 'public, max-age=60' } },
      ),
    );
  });

export const indexHandler = (ctx: APIContext) =>
  Effect.succeed(
    withCors(
      json({
        name: 'Polyweb API',
        version: 1,
        openapi: `${ctx.url.origin}/api/v1/openapi.json`,
        endpoints: ['/api/v1/content-types', '/api/v1/content/{type}', '/api/v1/content/{type}/{ref}'],
      }),
    ),
  );

