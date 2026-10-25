/**
 * Vues enregistrées (core/filters) — base réelle : canonicalisation serveur, propriété
 * stricte (autre utilisateur → FORBIDDEN sans fuite), unicité du nom, plafond, RBAC.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: any) => def };
});

import { eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { adminSavedViews, user } from '@database/schemas';
import { createSavedView, deleteSavedView, listSavedViews, MAX_SAVED_VIEWS, renameSavedView } from '@/actions/admin/saved-views';
import { resetRateLimiter } from '@/lib/rate-limit';

const h = (a: unknown) => (a as any).handler as (i: any, c: any) => Promise<any>;
const db = getDrizzle();
const t = `sv-${Date.now().toString(36)}`;
const admin = `${t}-admin`;
const other = `${t}-other`;
const member = `${t}-member`;
const ctx = (id: string, role = 'admin') => ({ locals: { user: { id, role, email: `${id}@test.local`, banned: false } }, request: { headers: new Headers() }, clientAddress: '127.0.0.1' }) as any;

beforeAll(async () => {
  await db.insert(user).values([
    { id: admin, name: 'SV admin', email: `${admin}@test.local`, role: 'admin' },
    { id: other, name: 'SV other admin', email: `${other}@test.local`, role: 'admin' },
    { id: member, name: 'SV member', email: `${member}@test.local`, role: 'user' },
  ]);
});
afterAll(async () => {
  await db.delete(user).where(inArray(user.id, [admin, other, member]));
});

describe('vues enregistrées', () => {
  let id = '';
  it('crée une vue avec une requête canonique (valeurs invalides retirées)', async () => {
    resetRateLimiter();
    const view = await h(createSavedView)({ resource: 'service', organizationId: null, name: 'Brouillons', query: '?status=DRAFT&page=1&evil=1&sortBy=updatedAt&sortOrder=desc&featured=maybe' }, ctx(admin));
    expect(view.query).toBe('status=DRAFT');
    id = view.id;
    expect(await h(listSavedViews)({ resource: 'service', organizationId: null }, ctx(admin))).toEqual([{ id, name: 'Brouillons', query: 'status=DRAFT' }]);
  });

  it('nom en double → CONFLICT', async () => {
    await expect(h(createSavedView)({ resource: 'service', organizationId: null, name: 'Brouillons', query: '' }, ctx(admin))).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('un autre utilisateur ne voit, ne renomme ni ne supprime la vue', async () => {
    expect(await h(listSavedViews)({ resource: 'service', organizationId: null }, ctx(other))).toEqual([]);
    await expect(h(renameSavedView)({ id, name: 'pirate' }, ctx(other))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h(deleteSavedView)({ id }, ctx(other))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h(deleteSavedView)({ id: crypto.randomUUID() }, ctx(other))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('même garde que la page de liste (RBAC lecture) : compte suspendu → FORBIDDEN, anonyme → UNAUTHORIZED', async () => {
    const banned = { ...ctx(member, 'user'), locals: { user: { id: member, role: 'user', email: 'x', banned: true } } };
    await expect(h(listSavedViews)({ resource: 'pages', organizationId: null }, banned)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h(listSavedViews)({ resource: 'pages', organizationId: null }, { ...ctx(member), locals: {} })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('organisation dont on n’est pas membre → FORBIDDEN', async () => {
    await expect(h(listSavedViews)({ resource: 'service', organizationId: `${t}-org` }, ctx(member, 'user'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('plafond par liste', async () => {
    const rows = Array.from({ length: MAX_SAVED_VIEWS - 1 }, (_, i) => ({ userId: admin, resource: 'service', name: `v${i}`, query: '' }));
    await db.insert(adminSavedViews).values(rows);
    resetRateLimiter();
    await expect(h(createSavedView)({ resource: 'service', organizationId: null, name: 'de trop', query: '' }, ctx(admin))).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('renomme puis supprime sa propre vue', async () => {
    expect(await h(renameSavedView)({ id, name: 'Mes brouillons' }, ctx(admin))).toEqual({ success: true });
    expect(await h(deleteSavedView)({ id }, ctx(admin))).toEqual({ success: true });
    expect((await db.select().from(adminSavedViews).where(eq(adminSavedViews.id, id))).length).toBe(0);
  });
});
