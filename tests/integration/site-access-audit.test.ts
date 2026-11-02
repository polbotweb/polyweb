/**
 * Accès par site et journal d'audit : IDOR, inter-organisations, inter-sites et refus audités.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Effect, Exit } from 'effect';
import { and, eq, inArray } from 'drizzle-orm';

vi.mock('astro:actions', () => ({
  ActionError: class extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  },
}));

import { getDrizzle, schema } from '@/database/drizzle';
import { auditLog, siteAccess, sites } from '@/database/schemas';
import { grantSiteAccess, listSiteAccess, revokeSiteAccess } from '@/core/permissions/site-access';
import { tenantPermission } from '@/core/permissions/tenant';
import { queryOrganizationAudit, exportOrganizationAudit } from '@/core/audit/query';
import { requireTenantPermission } from '@/lib/effect/action';
import { logAuditEventEffect } from '@/lib/audit';
import { purgeAuditRows } from '../helpers/audit-purge';

const db = getDrizzle();
const tag = `sa-${Date.now()}`;
const orgA = `${tag}-a`;
const orgB = `${tag}-b`;
const u = { owner: `${tag}-owner`, editor: `${tag}-editor`, outsider: `${tag}-outsider` };
let siteA1 = '';
let siteA2 = '';
let siteB = '';

const run = <A, E>(e: Effect.Effect<A, E>) => Effect.runPromise(e);
const actor = (id: string) => ({ id, role: 'user', banned: false });
const ctx = (id: string, siteId?: string) => ({ locals: { user: { ...actor(id), name: id, email: `${id}@example.test` }, site: siteId ? { id: siteId } : undefined } }) as never;

beforeAll(async () => {
  await db.insert(schema.user).values(Object.values(u).map((id) => ({ id, name: id, email: `${id}@example.test`, emailVerified: true })));
  await db.insert(schema.organization).values([{ id: orgA, name: 'A', slug: orgA, createdAt: new Date() }, { id: orgB, name: 'B', slug: orgB, createdAt: new Date() }]);
  await db.insert(schema.member).values([
    { id: `${tag}-m1`, organizationId: orgA, userId: u.owner, role: 'owner', createdAt: new Date() },
    { id: `${tag}-m2`, organizationId: orgA, userId: u.editor, role: 'admin', createdAt: new Date() },
    { id: `${tag}-m3`, organizationId: orgB, userId: u.outsider, role: 'owner', createdAt: new Date() },
  ]);
  const rows = await db.insert(sites).values([
    { slug: `${tag}-a1`, name: 'A1', organizationId: orgA },
    { slug: `${tag}-a2`, name: 'A2', organizationId: orgA },
    { slug: `${tag}-b`, name: 'B', organizationId: orgB },
  ]).returning({ id: sites.id, slug: sites.slug });
  siteA1 = rows.find((r) => r.slug === `${tag}-a1`)!.id;
  siteA2 = rows.find((r) => r.slug === `${tag}-a2`)!.id;
  siteB = rows.find((r) => r.slug === `${tag}-b`)!.id;
});

afterAll(async () => {
  await purgeAuditRows(inArray(auditLog.organizationId, [orgA, orgB]));
  await db.delete(sites).where(inArray(sites.id, [siteA1, siteA2, siteB]));
  await db.delete(schema.organization).where(inArray(schema.organization.id, [orgA, orgB]));
  await db.delete(schema.user).where(inArray(schema.user.id, Object.values(u)));
});

describe('site_access — gestion bornée à l’organisation', () => {
  it('refuse un site d’une autre organisation (IDOR) et un non-membre comme introuvables', async () => {
    expect(await run(grantSiteAccess({ organizationId: orgA, siteId: siteB, userId: u.editor, role: null, createdBy: u.owner }))).toEqual({ ok: false, reason: 'not-found' });
    expect(await run(grantSiteAccess({ organizationId: orgA, siteId: siteA1, userId: u.outsider, role: null, createdBy: u.owner }))).toEqual({ ok: false, reason: 'not-found' });
  });

  it('refuse de restreindre le propriétaire et un rôle inconnu', async () => {
    expect(await run(grantSiteAccess({ organizationId: orgA, siteId: siteA1, userId: u.owner, role: null, createdBy: u.owner }))).toEqual({ ok: false, reason: 'owner' });
    expect(await run(grantSiteAccess({ organizationId: orgA, siteId: siteA1, userId: u.editor, role: 'owner', createdBy: u.owner }))).toEqual({ ok: false, reason: 'role' });
  });

  it('accorde (upsert) puis restreint réellement le membre au site listé', async () => {
    const first = await run(grantSiteAccess({ organizationId: orgA, siteId: siteA1, userId: u.editor, role: 'member', createdBy: u.owner }));
    const again = await run(grantSiteAccess({ organizationId: orgA, siteId: siteA1, userId: u.editor, role: 'admin', createdBy: u.owner }));
    expect(first.ok && again.ok && first.id === again.id).toBe(true);
    const list = await run(listSiteAccess(orgA));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ siteId: siteA1, userId: u.editor, role: 'admin' });
    expect(await run(listSiteAccess(orgB))).toHaveLength(0);

    expect(await run(tenantPermission(actor(u.editor), orgA, { page: ['update'] }, siteA1))).toMatchObject({ allowed: true });
    expect(await run(tenantPermission(actor(u.editor), orgA, { page: ['update'] }, siteA2))).toEqual({ allowed: false, reason: 'site' });
    expect(await run(tenantPermission(actor(u.owner), orgA, { page: ['update'] }, siteA2))).toMatchObject({ allowed: true });
    expect(await run(tenantPermission(actor(u.outsider), orgA, { page: ['update'] }, siteA1))).toEqual({ allowed: false, reason: 'not-member' });
  });

  it('la révocation par identifiant ne touche pas une autre organisation', async () => {
    const [row] = await db.select({ id: siteAccess.id }).from(siteAccess).where(eq(siteAccess.organizationId, orgA));
    expect(await run(revokeSiteAccess(orgB, row!.id))).toBeNull();
    expect(await run(listSiteAccess(orgA))).toHaveLength(1);
    expect(await run(revokeSiteAccess(orgA, row!.id))).toMatchObject({ id: row!.id, siteId: siteA1 });
    expect(await run(listSiteAccess(orgA))).toHaveLength(0);
  });
});

describe('refus audités', () => {
  it('un refus inter-sites est journalisé avec la portée et outcome=denied', async () => {
    await run(grantSiteAccess({ organizationId: orgA, siteId: siteA1, userId: u.editor, role: null, createdBy: u.owner }));
    const exit = await Effect.runPromiseExit(requireTenantPermission(ctx(u.editor), { crm: ['update'] } as never, orgA, siteA2));
    expect(Exit.isFailure(exit)).toBe(true);
    const rows = await db.select().from(auditLog).where(and(eq(auditLog.organizationId, orgA), eq(auditLog.userId, u.editor), eq(auditLog.outcome, 'denied')));
    expect(rows.some((r) => r.action === 'crm.permission.denied' && r.siteId === siteA2 && (r.metadata as { reason?: string }).reason === 'site')).toBe(true);
  });

  it('un refus inter-organisations est journalisé dans l’organisation visée', async () => {
    const exit = await Effect.runPromiseExit(requireTenantPermission(ctx(u.outsider), { crm: ['read'] } as never, orgA, null));
    expect(Exit.isFailure(exit)).toBe(true);
    const rows = await db.select().from(auditLog).where(and(eq(auditLog.organizationId, orgA), eq(auditLog.userId, u.outsider)));
    expect(rows.map((r) => [r.outcome, (r.metadata as { reason?: string }).reason])).toContainEqual(['denied', 'not-member']);
  });

  it('une écriture autorisée est journalisée (granted), une lecture autorisée ne l’est pas', async () => {
    await run(requireTenantPermission(ctx(u.owner), { crm: ['read'] } as never, orgA, null));
    await run(requireTenantPermission(ctx(u.owner), { crm: ['update'] } as never, orgA, null));
    const rows = await db.select({ action: auditLog.action, outcome: auditLog.outcome }).from(auditLog).where(and(eq(auditLog.organizationId, orgA), eq(auditLog.userId, u.owner)));
    expect(rows).toEqual([{ action: 'crm.permission.granted', outcome: 'success' }]);
  });
});

describe('journal d’audit par organisation', () => {
  it('la consultation et l’export ne voient que l’organisation demandée', async () => {
    await run(logAuditEventEffect({ action: 'crm.contact.update', module: 'crm', organizationId: orgB, outcome: 'success', resource: tag }));
    const a = await run(queryOrganizationAudit(orgA, {}, 1));
    expect(a.total).toBeGreaterThan(0);
    expect(a.rows.every((r) => r.action !== 'crm.contact.update')).toBe(true);
    const b = await run(queryOrganizationAudit(orgB, {}, 1));
    expect(b.rows.map((r) => r.action)).toEqual(['crm.contact.update']);
    const csvA = await run(exportOrganizationAudit(orgA, {}));
    expect(csvA).not.toContain('crm.contact.update');
  });

  it('filtre par résultat, module et préfixe d’action (caractères LIKE échappés)', async () => {
    const denied = await run(queryOrganizationAudit(orgA, { outcome: 'denied' }, 1));
    expect(denied.rows.length).toBeGreaterThan(0);
    expect(denied.rows.every((r) => r.outcome === 'denied')).toBe(true);
    expect((await run(queryOrganizationAudit(orgA, { module: 'crm', action: 'crm.permission.d' }, 1))).rows.every((r) => r.action === 'crm.permission.denied')).toBe(true);
    expect((await run(queryOrganizationAudit(orgA, { action: '%' }, 1))).total).toBe(0);
  });
});
