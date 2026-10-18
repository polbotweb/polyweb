/**
 * Verrou générique (src/core/locks) contre un vrai Postgres : atomicité de l'acquisition
 * concurrente (ON CONFLICT … WHERE), expiration, propriétaire utilisateur+session,
 * reprise par le même utilisateur et libération administrative — table service_locks.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { member, organization, serviceLocks, services, user } from '@database/schemas';
import { serviceLock } from '@/modules/services/locks';
import { LockExpiredError, LockHeldError, LockReleaseForbiddenError, LockResourceNotFoundError } from '@/core/locks/errors';

const tag = `lockpg-${crypto.randomUUID().slice(0, 8)}`;
const alice = `${tag}-alice`;
const bob = `${tag}-bob`;
const serviceId = crypto.randomUUID();
const run = <A, E>(e: Effect.Effect<A, E>) => Effect.runPromise(e);
const flip = <A, E>(e: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(e));

beforeAll(async () => {
  const db = getDrizzle();
  await db.insert(user).values([
    { id: alice, name: 'Alice', email: `${alice}@example.test` },
    { id: bob, name: 'Bob', email: `${bob}@example.test` },
  ]);
  await db.insert(services).values({ id: serviceId, providerId: alice, slug: tag });
});

afterAll(async () => {
  const db = getDrizzle();
  await db.delete(serviceLocks).where(eq(serviceLocks.serviceId, serviceId));
  await db.delete(services).where(eq(services.id, serviceId));
  await db.delete(user).where(inArray(user.id, [alice, bob]));
});

describe('core/locks sur Postgres (service_locks)', () => {
  it('acquisitions concurrentes : un seul propriétaire gagne', async () => {
    const owners = Array.from({ length: 8 }, (_, i) => ({ userId: i % 2 ? bob : alice, sessionId: `s-${i}` }));
    const results = await Promise.allSettled(owners.map((owner) => run(serviceLock.acquire(serviceId, owner))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) if (r.status === 'rejected') expect(String(r.reason)).toMatch(/LockHeldError|édition|session/);
    const rows = await getDrizzle().select().from(serviceLocks).where(eq(serviceLocks.serviceId, serviceId));
    expect(rows).toHaveLength(1);
    await run(serviceLock.forceRelease(serviceId));
  });

  it('renouvellement par le propriétaire, blocage des autres, expiration puis purge', async () => {
    const t0 = new Date();
    const a = { userId: alice, sessionId: 'sa' };
    await run(serviceLock.acquire(serviceId, a, { now: t0 }));
    await run(serviceLock.acquire(serviceId, a, { now: new Date(t0.getTime() + 1000) }));
    const held = await flip(serviceLock.ensureNotLockedByOther(serviceId, { userId: bob, sessionId: 'sb' }, 'en'));
    expect(held).toBeInstanceOf(LockHeldError);
    expect(held.message).toBe('This content is being edited by another editor.');
    // Après expiration (TTL 30 min), Bob acquiert : le verrou expiré est remplacé atomiquement.
    const later = new Date(t0.getTime() + 31 * 60 * 1000);
    await run(serviceLock.acquire(serviceId, { userId: bob, sessionId: 'sb' }, { now: later }));
    const [row] = await getDrizzle().select().from(serviceLocks).where(eq(serviceLocks.serviceId, serviceId));
    expect(row.userId).toBe(bob);
    await run(serviceLock.release(serviceId, { userId: bob, sessionId: 'sb' }));
    expect(await flip(serviceLock.requireOwn(serviceId, { userId: bob, sessionId: 'sb' }))).toBeInstanceOf(LockExpiredError);
  });

  it("même utilisateur, autre session : confirmation exigée puis reprise atomique ; l'autre utilisateur reste bloqué", async () => {
    await run(serviceLock.acquire(serviceId, { userId: alice, sessionId: 'tab-1' }));
    const prompt = await flip(serviceLock.acquire(serviceId, { userId: alice, sessionId: 'tab-2' }, { locale: 'fr' }));
    expect(prompt).toBeInstanceOf(LockHeldError);
    expect((prompt as LockHeldError).sameUser).toBe(true);
    expect(prompt.message).toBe('Vous éditez déjà ce contenu dans une autre session — reprendre ici ?');
    const taken = await run(serviceLock.acquire(serviceId, { userId: alice, sessionId: 'tab-2' }, { takeOver: true }));
    expect(taken.tookOverFrom).toBe('tab-1');
    const bobTry = await flip(serviceLock.acquire(serviceId, { userId: bob, sessionId: 'sb' }, { takeOver: true }));
    expect(bobTry).toBeInstanceOf(LockHeldError);
    expect((bobTry as LockHeldError).sameUser).toBe(false);
    await run(serviceLock.requireOwn(serviceId, { userId: alice, sessionId: 'tab-2' }));
    expect(await flip(serviceLock.requireOwn(serviceId, { userId: alice, sessionId: 'tab-1' }))).toBeInstanceOf(LockHeldError);
    await run(serviceLock.forceRelease(serviceId));
    expect(await getDrizzle().select().from(serviceLocks).where(eq(serviceLocks.serviceId, serviceId))).toHaveLength(0);
  });
});

describe('libération administrative contrôlée par tenant (Postgres)', () => {
  const t = `lockadm-${crypto.randomUUID().slice(0, 8)}`;
  const ids = { editor: `${t}-editor`, adminA: `${t}-admina`, memberA: `${t}-membera`, adminB: `${t}-adminb`, global: `${t}-global` };
  const orgA = `${t}-org-a`;
  const orgB = `${t}-org-b`;
  const orgService = crypto.randomUUID();
  const platformService = crypto.randomUUID();
  const actor = (id: string, role = 'user') => ({ id, role, banned: false });

  beforeAll(async () => {
    const db = getDrizzle();
    await db.insert(user).values(Object.values(ids).map((id) => ({ id, name: id, email: `${id}@example.test`, role: id === ids.global ? 'admin' : 'user' })));
    await db.insert(organization).values([
      { id: orgA, name: 'A', slug: orgA, createdAt: new Date() },
      { id: orgB, name: 'B', slug: orgB, createdAt: new Date() },
    ]);
    await db.insert(member).values([
      { id: `${t}-m1`, organizationId: orgA, userId: ids.adminA, role: 'admin', createdAt: new Date() },
      { id: `${t}-m2`, organizationId: orgA, userId: ids.memberA, role: 'member', createdAt: new Date() },
      { id: `${t}-m3`, organizationId: orgB, userId: ids.adminB, role: 'owner', createdAt: new Date() },
    ]);
    await db.insert(services).values([
      { id: orgService, providerId: ids.editor, slug: `${t}-a`, organizationId: orgA },
      { id: platformService, providerId: ids.editor, slug: `${t}-p` },
    ]);
  });

  afterAll(async () => {
    const db = getDrizzle();
    await db.delete(services).where(inArray(services.id, [orgService, platformService]));
    await db.delete(member).where(inArray(member.organizationId, [orgA, orgB]));
    await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
    await db.delete(user).where(inArray(user.id, Object.values(ids)));
  });

  const lockBy = (id: string) => run(serviceLock.acquire(id, { userId: ids.editor, sessionId: 'editor-tab' }));
  const lockRow = (id: string) => getDrizzle().select().from(serviceLocks).where(eq(serviceLocks.serviceId, id));

  it("admin d'une autre organisation refusé ; simple membre refusé ; verrou intact", async () => {
    await lockBy(orgService);
    expect(await flip(serviceLock.adminRelease(orgService, actor(ids.adminB)))).toBeInstanceOf(LockReleaseForbiddenError);
    expect(await flip(serviceLock.adminRelease(orgService, actor(ids.memberA)))).toBeInstanceOf(LockReleaseForbiddenError);
    expect(await lockRow(orgService)).toHaveLength(1);
  });

  it("admin de l'organisation propriétaire libère et récupère l'ancien propriétaire", async () => {
    const released = await run(serviceLock.adminRelease(orgService, actor(ids.adminA)));
    expect(released.organizationId).toBe(orgA);
    expect(released.previousOwner).toMatchObject({ userId: ids.editor, sessionId: 'editor-tab' });
    expect(await lockRow(orgService)).toHaveLength(0);
  });

  it('ressource plateforme : admin d’organisation refusé, administrateur global autorisé (partout)', async () => {
    await lockBy(platformService);
    expect(await flip(serviceLock.adminRelease(platformService, actor(ids.adminA)))).toBeInstanceOf(LockReleaseForbiddenError);
    expect((await run(serviceLock.adminRelease(platformService, actor(ids.global, 'admin')))).previousOwner?.userId).toBe(ids.editor);
    await lockBy(orgService);
    expect((await run(serviceLock.adminRelease(orgService, actor(ids.global, 'admin')))).organizationId).toBe(orgA);
  });

  it('ressource inconnue → LockResourceNotFoundError', async () => {
    expect(await flip(serviceLock.adminRelease(crypto.randomUUID(), actor(ids.global, 'admin')))).toBeInstanceOf(LockResourceNotFoundError);
  });
});
