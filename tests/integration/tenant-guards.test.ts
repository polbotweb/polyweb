/**
 * Gardes tenant-aware des modules générés (events, formations, courses, shop) — base réelle.
 * Admin global → tout ; owner/admin d'organisation → SA organisation uniquement ;
 * autre organisation, simple membre ou contenu plateforme sans RBAC global → FORBIDDEN.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: any) => def };
});
// RBAC global refusé aux non-admins : seul le chemin tenant (rôle d'organisation) peut autoriser.
vi.mock('@/lib/auth', () => ({ auth: { api: { userHasPermission: vi.fn(() => Promise.resolve({ success: false })) } } }));

import { eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { member, organization, user } from '@database/schemas';
import { events } from '@/modules/events/schema';
import { formations } from '@/modules/formations/schema';
import { courses } from '@/modules/courses/schema';
import { products } from '@/modules/shop/schema';
import { eventsActions } from '@/modules/events/actions';
import { formationsActions } from '@/modules/formations/actions';
import { coursesActions } from '@/modules/courses/actions';
import { shopActions } from '@/modules/shop/actions';
import { resetRateLimiter } from '@/lib/rate-limit';

const db = getDrizzle();
const t = `tg-${Date.now().toString(36)}`;
const orgA = `${t}-org-a`;
const orgB = `${t}-org-b`;
const u = { global: `${t}-global`, adminA: `${t}-admin-a`, ownerB: `${t}-owner-b`, memberA: `${t}-member-a` };
type Who = keyof typeof u | 'anonymous';
const ctx = (who: Who) => ({
  locals: who === 'anonymous' ? {} : { user: { id: u[who], role: who === 'global' ? 'admin' : 'user', email: `${u[who]}@test.local`, banned: false }, session: { id: `${u[who]}-s` } },
  request: { headers: new Headers() },
  clientAddress: '127.0.0.1',
}) as any;
const h = (a: unknown) => (a as any).handler as (i: any, c: any) => Promise<any>;

const modules = [
  { name: 'events', table: events, actions: eventsActions },
  { name: 'formations', table: formations, actions: formationsActions },
  { name: 'courses', table: courses, actions: coursesActions },
  { name: 'shop', table: products, actions: shopActions },
] as const;

beforeAll(async () => {
  await db.insert(user).values(Object.entries(u).map(([k, id]) => ({ id, name: id, email: `${id}@test.local`, role: k === 'global' ? 'admin' : 'user' })));
  await db.insert(organization).values([
    { id: orgA, name: 'A', slug: orgA, createdAt: new Date() },
    { id: orgB, name: 'B', slug: orgB, createdAt: new Date() },
  ]);
  await db.insert(member).values([
    { id: `${t}-m1`, organizationId: orgA, userId: u.adminA, role: 'admin', createdAt: new Date() },
    { id: `${t}-m2`, organizationId: orgB, userId: u.ownerB, role: 'owner', createdAt: new Date() },
    { id: `${t}-m3`, organizationId: orgA, userId: u.memberA, role: 'member', createdAt: new Date() },
  ]);
});

afterAll(async () => {
  await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
  await db.delete(user).where(inArray(user.id, Object.values(u)));
});

describe.each(modules)('gardes tenant — $name', ({ name, table, actions }) => {
  let orgItem = '';

  it("l'admin de l'organisation A crée et modifie le contenu de A", async () => {
    resetRateLimiter();
    const row = await h(actions.create)({ title: `${name} A`, slug: `${t}-${name}-a`, organizationId: orgA }, ctx('adminA'));
    orgItem = row.id;
    expect(row.organizationId).toBe(orgA);
    expect(await h(actions.update)({ id: orgItem, title: `${name} A2` }, ctx('adminA'))).toMatchObject({ title: `${name} A2` });
    await h(actions.unlock)({ id: orgItem }, ctx('adminA'));
  });

  it("autre organisation refusée : l'owner de B ne gère pas le contenu de A", async () => {
    await expect(h(actions.create)({ title: 'x', slug: `${t}-${name}-b-in-a`, organizationId: orgA }, ctx('ownerB'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h(actions.update)({ id: orgItem, title: 'pirate' }, ctx('ownerB'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h(actions.transition)({ id: orgItem, to: 'PUBLISHED' }, ctx('ownerB'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h(actions.lock)({ id: orgItem }, ctx('ownerB'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h(actions.bulk)({ ids: [orgItem], organizationId: orgA, operation: 'publish' }, ctx('ownerB'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const [row] = await db.select().from(table).where(eq(table.id, orgItem));
    expect(row.title).toBe(`${name} A2`);
    expect(row.status).toBe('DRAFT');
  });

  it('un simple membre de A et un admin de A sur le contenu plateforme sont refusés', async () => {
    await expect(h(actions.update)({ id: orgItem, title: 'm' }, ctx('memberA'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h(actions.create)({ title: 'p', slug: `${t}-${name}-p`, organizationId: null }, ctx('adminA'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it("l'admin global gère tout (organisation A et plateforme)", async () => {
    expect(await h(actions.transition)({ id: orgItem, to: 'PUBLISHED' }, ctx('global'))).toMatchObject({ status: 'PUBLISHED' });
    const platform = await h(actions.create)({ title: 'p', slug: `${t}-${name}-p`, organizationId: null }, ctx('global'));
    expect(platform.organizationId).toBeNull();
    await db.delete(table).where(eq(table.id, platform.id));
  });

  it("session requise avant toute lecture ; élément inconnu → NOT_FOUND", async () => {
    await expect(h(actions.update)({ id: orgItem, title: 'x' }, ctx('anonymous'))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(h(actions.update)({ id: crypto.randomUUID(), title: 'x' }, ctx('adminA'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
