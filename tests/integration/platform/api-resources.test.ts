/**
 * API publique — ressources du registre (`/api/v1/{resource}`) : isolation tenant (IDOR,
 * cross-site → 404), scopes, Idempotency-Key, pagination par curseur, limite par clé (429 +
 * RateLimit-*), OpenAPI, et outbox d'événements (`contact.created` diffusé après COMMIT).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: unknown) => def };
});

import type { APIContext } from 'astro';
import { and, eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { organization, user, crmContacts, eventOutbox, sites } from '@database/schemas';
import { appRuntime } from '@/lib/effect/runtime';
import { apiRoute } from '@/lib/effect/http';
import { resetRateLimiter } from '@/lib/rate-limit';
import { clearApiResourcesForTests, registerModuleApi } from '@/core/api/registry';
import { crmApi } from '@/modules/crm/api/public-api';
import { createToken } from '@/modules/api/domain/tokens';
import * as resources from '@/modules/api/domain/resources';
import { openApiHandler } from '@/modules/api/domain/v1';
import { createTestSite, removeTestSite } from '../../helpers/platform';
import type { Site } from '@/modules/sites/domain/sites';

const db = getDrizzle();
const t = `apir-${Date.now().toString(36)}`;
const author = `${t}-author`;
const orgA = `${t}-a`;
const orgB = `${t}-b`;
let siteA: Site;
let siteB: Site;
let readA: string;
let writeA: string;
let writeB: string;

interface Opts { token?: string; body?: unknown; params?: Record<string, string>; headers?: Record<string, string>; site?: Site }
function ctx(method: string, path: string, opts: Opts = {}): APIContext {
  const url = new URL(`http://localhost${path}`);
  const headers = new Headers(opts.headers);
  if (opts.token) headers.set('authorization', `Bearer ${opts.token}`);
  if (opts.body !== undefined) headers.set('content-type', 'application/json');
  const request = new Request(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  return { request, url, params: opts.params ?? {}, locals: { site: opts.site ?? siteA }, clientAddress: '127.0.0.1' } as unknown as APIContext;
}
const call = async (handler: Parameters<typeof apiRoute>[0], c: APIContext) => {
  const res = await apiRoute(handler)(c);
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
};
const list = (token: string, query = '', site = siteA) =>
  call(resources.listResourceHandler, ctx('GET', `/api/v1/contacts${query}`, { token, site, params: { resource: 'contacts' } }));
const get = (token: string, id: string, site = siteA) =>
  call(resources.getResourceHandler, ctx('GET', `/api/v1/contacts/${id}`, { token, site, params: { resource: 'contacts', id } }));
const create = (token: string, body: unknown, key?: string, site = siteA) =>
  call(resources.createResourceHandler, ctx('POST', '/api/v1/contacts', { token, site, body, params: { resource: 'contacts' }, headers: key ? { 'idempotency-key': key } : {} }));
const token = async (siteId: string, scopes: string[], extra: Record<string, unknown> = {}) =>
  (await appRuntime.runPromise(createToken(siteId, { name: `${t}-${scopes.join('-')}`, scopes, ...extra }, author))).token;

beforeAll(async () => {
  resetRateLimiter();
  clearApiResourcesForTests();
  registerModuleApi(crmApi);
  await db.insert(user).values({ id: author, name: 'API author', email: `${author}@test.local`, role: 'admin' });
  await db.insert(organization).values([
    { id: orgA, name: 'API org A', slug: orgA, createdAt: new Date() },
    { id: orgB, name: 'API org B', slug: orgB, createdAt: new Date() },
  ]);
  siteA = await createTestSite('apir-a');
  siteB = await createTestSite('apir-b');
  await db.update(sites).set({ organizationId: orgA }).where(eq(sites.id, siteA.id));
  await db.update(sites).set({ organizationId: orgB }).where(eq(sites.id, siteB.id));
  siteA = { ...siteA, organizationId: orgA };
  siteB = { ...siteB, organizationId: orgB };
  readA = await token(siteA.id, ['crm:read']);
  writeA = await token(siteA.id, ['crm:read', 'crm:write']);
  writeB = await token(siteB.id, ['crm:read', 'crm:write']);
});

afterAll(async () => {
  await db.delete(crmContacts).where(inArray(crmContacts.organizationId, [orgA, orgB]));
  await db.delete(eventOutbox).where(inArray(eventOutbox.organizationId, [orgA, orgB]));
  await removeTestSite(siteA.id);
  await removeTestSite(siteB.id);
  await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
  await db.delete(user).where(eq(user.id, author));
});

describe('API v1 — ressources du registre', () => {
  let contactA: string;

  it('crée sous crm:write et refuse crm:read seul (403) ou sans jeton (401)', async () => {
    const r = await create(writeA, { lastName: 'Durand', email: `durand-${t}@test.local` }, `${t}-k1`);
    expect(r.status).toBe(201);
    expect(r.headers.get('location')).toBe(`/api/v1/contacts/${r.body.data.id}`);
    contactA = r.body.data.id;
    expect((await create(readA, { lastName: 'X' })).status).toBe(403);
    expect((await call(resources.createResourceHandler, ctx('POST', '/api/v1/contacts', { body: { lastName: 'X' }, params: { resource: 'contacts' } }))).status).toBe(401);
  });

  it('IDOR / cross-site : la fiche d’une autre organisation répond 404 et n’apparaît pas dans la liste', async () => {
    expect((await get(readA, contactA)).status).toBe(200);
    expect((await get(writeB, contactA, siteB)).status).toBe(404);
    const other = await list(writeB, '', siteB);
    expect(other.status).toBe(200);
    expect(other.body.data.map((c: { id: string }) => c.id)).not.toContain(contactA);
    // Jeton du site A présenté sur l'hôte du site B : le tenant reste celui du jeton (site A),
    // jamais celui de l'hôte — la clé B ne voit toujours rien de A, la clé A rien de B.
    const viaB = await list(readA, '', siteB);
    expect(viaB.body.data.map((c: { id: string }) => c.id)).toContain(contactA);
    const bContact = await create(writeB, { lastName: 'Bernard' }, `${t}-kb`, siteB);
    expect((await get(readA, bContact.body.data.id, siteB)).status).toBe(404);
    // PATCH d'une fiche d'un autre tenant : 404, aucune écriture.
    const patch = await call(resources.updateResourceHandler, ctx('PATCH', `/api/v1/contacts/${contactA}`, { token: writeB, site: siteB, body: { lastName: 'Pirate' }, params: { resource: 'contacts', id: contactA } }));
    expect(patch.status).toBe(404);
    const [row] = await db.select().from(crmContacts).where(eq(crmContacts.id, contactA));
    expect(row!.lastName).toBe('Durand');
  });

  it('Idempotency-Key : rejoue la même réponse, 400 si la requête diffère', async () => {
    const body = { lastName: 'Martin' };
    const a = await create(writeA, body, `${t}-k2`);
    const b = await create(writeA, body, `${t}-k2`);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.data.id).toBe(a.body.data.id);
    expect(b.headers.get('idempotent-replayed')).toBe('true');
    expect((await create(writeA, { lastName: 'Autre' }, `${t}-k2`)).status).toBe(400);
    const rows = await db.select().from(crmContacts).where(and(eq(crmContacts.organizationId, orgA), eq(crmContacts.lastName, 'Martin')));
    expect(rows).toHaveLength(1);
  });

  it('pagine par curseur sans recouvrement et refuse un curseur invalide (400)', async () => {
    await create(writeA, { lastName: 'Petit' }, `${t}-k3`);
    const p1 = await list(readA, '?limit=2');
    expect(p1.status).toBe(200);
    expect(p1.body.data).toHaveLength(2);
    expect(p1.body.meta.nextCursor).toEqual(expect.any(String));
    const p2 = await list(readA, `?limit=2&cursor=${encodeURIComponent(p1.body.meta.nextCursor)}`);
    expect(p2.body.data).toHaveLength(1);
    expect(p2.body.meta.nextCursor).toBeNull();
    const ids = [...p1.body.data, ...p2.body.data].map((c: { id: string }) => c.id);
    expect(new Set(ids).size).toBe(3);
    expect((await list(readA, '?cursor=@@invalid')).status).toBe(400);
    expect((await list(readA, '?limit=500')).status).toBe(400);
  });

  it('limite par clé : 429 au-delà de rateLimitPerMinute, en-têtes RateLimit sinon', async () => {
    const limited = await token(siteA.id, ['crm:read'], { rateLimitPerMinute: 2 });
    const first = await list(limited);
    expect(first.status).toBe(200);
    expect(first.headers.get('ratelimit-limit')).toBe('2');
    expect(first.headers.get('ratelimit-remaining')).toBe('1');
    expect((await list(limited)).status).toBe(200);
    const blocked = await list(limited);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('OpenAPI : chemins, scopes et corps générés depuis le registre', async () => {
    const r = await call(openApiHandler, ctx('GET', '/api/v1/openapi.json', { token: readA }));
    expect(r.status).toBe(200);
    expect(r.body.paths['/contacts']).toBeDefined();
    expect(r.body.paths['/contacts/{id}']).toBeDefined();
    expect(JSON.stringify(r.body.paths['/contacts'])).toContain('crm:write');
  });

  it('outbox : contact.created enregistré dans la transaction et diffusé après COMMIT', async () => {
    const rows = await db.select().from(eventOutbox).where(and(eq(eventOutbox.organizationId, orgA), eq(eventOutbox.name, 'contact.created')));
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.dispatchedAt).not.toBeNull();
      expect(row.attempts).toBe(1);
    }
    // La réponse rejouée (Idempotency-Key) ne ré-enregistre aucun événement.
    expect(rows.filter((r) => (r.payload as { lastName?: string }).lastName === 'Martin')).toHaveLength(1);
  });
});
