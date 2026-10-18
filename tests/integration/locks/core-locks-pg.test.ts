/**
 * Verrou générique (src/core/locks) contre un vrai Postgres : atomicité de l'acquisition
 * concurrente (ON CONFLICT … WHERE), expiration, propriétaire utilisateur+session,
 * reprise par le même utilisateur et libération administrative — table service_locks.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { serviceLocks, services, user } from '@database/schemas';
import { serviceLock } from '@/modules/services/locks';
import { LockExpiredError, LockHeldError } from '@/core/locks/errors';

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
