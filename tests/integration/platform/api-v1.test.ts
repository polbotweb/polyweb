import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { APIContext } from 'astro';
import { appRuntime } from '@/lib/effect/runtime';
import { apiRoute } from '@/lib/effect/http';
import { createToken, revokeToken, generateToken, TOKEN_PATTERN } from '@/modules/api/domain/tokens';
import * as v1 from '@/modules/api/domain/v1';
import { resetRateLimiter } from '@/lib/rate-limit';
import { createTestSite, removeTestSite, createArticleType, sampleBlocks } from '../../helpers/platform';
import type { Site } from '@/modules/sites/domain/sites';

let site: Site;
let readToken: string;
let writeToken: string;

function ctx(method: string, path: string, opts: { token?: string; body?: unknown; params?: Record<string, string> } = {}): APIContext {
  const url = new URL(`http://localhost${path}`);
  const headers = new Headers();
  if (opts.token) headers.set('authorization', `Bearer ${opts.token}`);
  if (opts.body !== undefined) headers.set('content-type', 'application/json');
  const request = new Request(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  return { request, url, params: opts.params ?? {}, locals: { site }, clientAddress: '127.0.0.1' } as unknown as APIContext;
}

const call = async (handler: Parameters<typeof apiRoute>[0], c: APIContext) => {
  const res = await apiRoute(handler)(c);
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
};

beforeAll(async () => {
  resetRateLimiter();
  site = await createTestSite('api');
  await createArticleType(site.id);
  await createArticleType(site.id, { slug: 'secret', name: 'Secret', settings: { hasBlocks: false, publicRead: false, singleton: false } });
  readToken = (await appRuntime.runPromise(createToken(site.id, { name: 'read', scopes: ['content:read'] }, null))).token;
  writeToken = (await appRuntime.runPromise(createToken(site.id, { name: 'write', scopes: ['content:write'] }, null))).token;
});
afterAll(async () => { await removeTestSite(site.id); });

describe('API tokens', () => {
  it('generates well-formed unique tokens', () => {
    const a = generateToken(); const b = generateToken();
    expect(a.token).toMatch(TOKEN_PATTERN);
    expect(a.hash).toHaveLength(64);
    expect(a.token).not.toBe(b.token);
  });

  it('rejects invalid input with field issues', async () => {
    const r = await call(() => createToken(site.id, { name: '', scopes: ['nope'] }, null) as never, ctx('POST', '/x'));
    expect(r.status).toBe(400);
    expect(r.body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['name']));
  });
});

describe('API v1', () => {
  let entryId: string;

  it('hides non-public types from anonymous callers but shows them to tokens', async () => {
    const anon = await call(v1.listContentTypesHandler, ctx('GET', '/api/v1/content-types'));
    expect(anon.status).toBe(200);
    expect(anon.body.data.map((t: { slug: string }) => t.slug)).toEqual(['article']);
    const authed = await call(v1.listContentTypesHandler, ctx('GET', '/api/v1/content-types', { token: readToken }));
    expect(authed.body.data.map((t: { slug: string }) => t.slug).sort()).toEqual(['article', 'secret']);
    const secret = await call(v1.listEntriesHandler, ctx('GET', '/api/v1/content/secret', { params: { type: 'secret' } }));
    expect(secret.status).toBe(404);
  });

  it('rejects writes without a token (401), with a read token (403) and bad tokens (401)', async () => {
    const body = { translations: { fr: { title: 'X', data: { summary: 's' } } } };
    expect((await call(v1.createEntryHandler, ctx('POST', '/api/v1/content/article', { params: { type: 'article' }, body }))).status).toBe(401);
    expect((await call(v1.createEntryHandler, ctx('POST', '/api/v1/content/article', { params: { type: 'article' }, body, token: readToken }))).status).toBe(403);
    expect((await call(v1.createEntryHandler, ctx('POST', '/api/v1/content/article', { params: { type: 'article' }, body, token: 'pw_garbage' }))).status).toBe(401);
  });

  it('validates the body against the content type fields (400)', async () => {
    const r = await call(v1.createEntryHandler, ctx('POST', '/api/v1/content/article', { params: { type: 'article' }, token: writeToken, body: { translations: { fr: { title: 'X', data: {} } }, data: { rating: 9 } } }));
    expect(r.status).toBe(400);
    expect(r.body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['fr.summary', 'shared.rating']));
  });

  it('creates, publishes, reads (flattened locale), updates with optimistic locking and deletes', async () => {
    const created = await call(v1.createEntryHandler, ctx('POST', '/api/v1/content/article', {
      params: { type: 'article' }, token: writeToken,
      body: { slug: 'hello-api', status: 'published', data: { rating: 4, category: 'news' }, translations: { fr: { title: 'Bonjour', data: { summary: 'Résumé' }, blocks: sampleBlocks }, en: { title: 'Hello', data: { summary: 'Summary' } } } },
    }));
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('published');
    expect(Object.keys(created.body.data.translations).sort()).toEqual(['en', 'fr']);
    entryId = created.body.data.id;

    const list = await call(v1.listEntriesHandler, ctx('GET', '/api/v1/content/article?locale=en', { params: { type: 'article' } }));
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({ slug: 'hello-api', title: 'Hello', locale: 'en', data: { rating: 4, summary: 'Summary' } });
    expect(list.headers.get('access-control-allow-origin')).toBe('*');

    const one = await call(v1.getEntryHandler, ctx('GET', '/api/v1/content/article/hello-api?locale=fr', { params: { type: 'article', ref: 'hello-api' } }));
    expect(one.body.data.blocks.blocks).toHaveLength(2);

    const stale = await call(v1.updateEntryHandler, ctx('PATCH', `/api/v1/content/article/${entryId}`, { params: { type: 'article', ref: entryId }, token: writeToken, body: { expectedVersion: 99, translations: { fr: { title: 'Bonjour 2', data: { summary: 'R' } } } } }));
    expect(stale.status).toBe(409);
    const version = created.body.data.version as number;
    const ok = await call(v1.updateEntryHandler, ctx('PATCH', `/api/v1/content/article/${entryId}`, { params: { type: 'article', ref: entryId }, token: writeToken, body: { expectedVersion: version, status: 'draft', translations: { fr: { title: 'Bonjour 2', data: { summary: 'R' } } } } }));
    expect(ok.status).toBe(200);
    expect(ok.body.data.translations.fr.title).toBe('Bonjour 2');
    expect(ok.body.data.status).toBe('draft');

    // Now a draft: invisible anonymously, visible with content:write and status=any
    expect((await call(v1.getEntryHandler, ctx('GET', '/api/v1/content/article/hello-api', { params: { type: 'article', ref: 'hello-api' } }))).status).toBe(404);
    expect((await call(v1.listEntriesHandler, ctx('GET', '/api/v1/content/article?status=any', { params: { type: 'article' } }))).status).toBe(401);
    const drafts = await call(v1.listEntriesHandler, ctx('GET', '/api/v1/content/article?status=draft', { params: { type: 'article' }, token: writeToken }));
    expect(drafts.body.meta.total).toBe(1);

    const del = await apiRoute(v1.deleteEntryHandler)(ctx('DELETE', `/api/v1/content/article/${entryId}`, { params: { type: 'article', ref: entryId }, token: writeToken }));
    expect(del.status).toBe(204);
    expect((await call(v1.getEntryHandler, ctx('GET', `/api/v1/content/article/${entryId}`, { params: { type: 'article', ref: entryId }, token: writeToken }))).status).toBe(404);
  });

  it('serves an OpenAPI 3.1 document derived from content types', async () => {
    const r = await call(v1.openApiHandler, ctx('GET', '/api/v1/openapi.json'));
    expect(r.body.openapi).toBe('3.1.0');
    expect(r.body.paths['/content/article']).toBeDefined();
    expect(r.body.paths['/content/secret']).toBeUndefined();
    expect(r.body.components.schemas.ArticleTranslation.properties.data.required).toEqual(['summary']);
    expect(r.body.components.schemas.Article.properties.data.properties.category.enum).toEqual(['news', 'guide']);
  });

  it('refuses revoked tokens and rate-limits anonymous callers (429 + Retry-After)', async () => {
    const t = await appRuntime.runPromise(createToken(site.id, { name: 'tmp', scopes: ['content:read'] }, null));
    await appRuntime.runPromise(revokeToken(site.id, t.record.id));
    expect((await call(v1.listContentTypesHandler, ctx('GET', '/api/v1/content-types', { token: t.token }))).status).toBe(401);

    resetRateLimiter();
    let last = 200; let retry: string | null = null;
    for (let i = 0; i < 125 && last !== 429; i++) {
      const res = await apiRoute(v1.indexHandler as never)(ctx('GET', '/api/v1')); // index has no limit
      expect(res.status).toBe(200);
      const r = await apiRoute(v1.listContentTypesHandler)(ctx('GET', '/api/v1/content-types'));
      last = r.status; retry = r.headers.get('retry-after');
    }
    expect(last).toBe(429);
    expect(Number(retry)).toBeGreaterThan(0);
    resetRateLimiter();
  });
});
