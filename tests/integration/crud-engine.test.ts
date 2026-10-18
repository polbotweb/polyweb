import { describe, it, expect, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { socialLinks } from '@database/schemas';
import { handleCrud } from '@/core/crud/engine';
import { socialLinksCrud } from '@/generated/crud/social-links';

const db = getDrizzle();
const platform = `crud-test-${Date.now()}`;
const allow = async () => true;
const deny = async () => false;
const actor = { id: 'u1', role: 'admin' };

afterAll(async () => { await db.delete(socialLinks).where(eq(socialLinks.platform, platform)); });

describe('generated CRUD resource social-links (real DB)', () => {
  it('denies anonymous writes and allows public reads', async () => {
    const res = await handleCrud(socialLinksCrud, { method: 'POST', searchParams: new URLSearchParams(), body: { platform, url: 'https://x.test' }, actor: null }, db);
    expect(res.status).toBe(401);
    const list = await handleCrud(socialLinksCrud, { method: 'GET', searchParams: new URLSearchParams('perPage=5'), actor: null }, db);
    expect(list.status).toBe(200);
  });
  it('runs the full lifecycle with permission', async () => {
    const forbidden = await handleCrud(socialLinksCrud, { method: 'POST', searchParams: new URLSearchParams(), body: { platform, url: 'https://x.test' }, actor, hasPermission: deny }, db);
    expect(forbidden.status).toBe(403);
    const created = await handleCrud(socialLinksCrud, { method: 'POST', searchParams: new URLSearchParams(), body: { platform, url: 'https://x.test' }, actor, hasPermission: allow }, db);
    expect(created.status).toBe(201);
    const id = (created.body as { data: { id: string } }).data.id;
    const filtered = await handleCrud(socialLinksCrud, { method: 'GET', searchParams: new URLSearchParams(`filter[platform]=${platform}`), actor: null }, db);
    expect((filtered.body as { meta: { total: number } }).meta.total).toBe(1);
    const updated = await handleCrud(socialLinksCrud, { method: 'PATCH', id, searchParams: new URLSearchParams(), body: { label: 'X' }, actor, hasPermission: allow }, db);
    expect((updated.body as { data: { label: string } }).data.label).toBe('X');
    const bad = await handleCrud(socialLinksCrud, { method: 'PATCH', id, searchParams: new URLSearchParams(), body: { id: 'hijack' }, actor, hasPermission: allow }, db);
    expect(bad.status).toBe(422);
    const sortBad = await handleCrud(socialLinksCrud, { method: 'GET', searchParams: new URLSearchParams('sort=nope'), actor: null }, db);
    expect(sortBad.status).toBe(400);
    expect((await handleCrud(socialLinksCrud, { method: 'DELETE', id, searchParams: new URLSearchParams(), actor, hasPermission: allow }, db)).status).toBe(204);
    expect((await handleCrud(socialLinksCrud, { method: 'GET', id, searchParams: new URLSearchParams(), actor: null }, db)).status).toBe(404);
  });
});
