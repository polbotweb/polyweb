import { describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';

vi.mock('@/database/drizzle', () => ({ getDrizzle: vi.fn() }));
vi.mock('astro:actions', () => ({
  ActionError: class extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  },
}));

import { lockState, type LockOwner, type LockRecord } from '@/core/locks/policy';
import { LockExpiredError, LockHeldError } from '@/core/locks/errors';
import {
  acquireLock,
  ensureNoneLockedByOther,
  ensureNotLockedByOther,
  registerLockStore,
  releaseLock,
  requireOwnLock,
  type LockStore,
} from '@/core/locks/service';
import { toActionError } from '@/lib/effect/action';

/** Stockage mémoire au comportement atomique identique au stockage Drizzle. */
function memoryStore() {
  const rows = new Map<string, LockRecord>();
  const owns = (l: LockRecord, o: LockOwner) => l.userId === o.userId && (o.sessionId === null || l.sessionId === o.sessionId);
  const store: LockStore = {
    read: (id) => Effect.sync(() => rows.get(id) ?? null),
    readMany: (ids) => Effect.sync(() => ids.flatMap((id) => (rows.has(id) ? [{ ...rows.get(id)!, resourceId: id }] : []))),
    tryAcquire: (id, o, expiresAt, now) =>
      Effect.sync(() => {
        const cur = rows.get(id);
        if (cur && cur.expiresAt > now && !owns(cur, o)) return false;
        rows.set(id, { userId: o.userId, sessionId: o.sessionId ?? '', lockedAt: now, expiresAt });
        return true;
      }),
    release: (id, o) => Effect.sync(() => { const cur = rows.get(id); if (cur && owns(cur, o)) rows.delete(id); }),
    purgeExpired: (id, now) => Effect.sync(() => { const cur = rows.get(id); if (cur && cur.expiresAt <= now) rows.delete(id); }),
  };
  return { rows, store };
}

const alice: LockOwner = { userId: 'alice', sessionId: 's1' };
const aliceOtherTab: LockOwner = { userId: 'alice', sessionId: 's2' };
const bob: LockOwner = { userId: 'bob', sessionId: 'b1' };
const t0 = new Date('2026-10-18T10:00:00Z');
const later = (ms: number) => new Date(t0.getTime() + ms);

const failure = async <A, E>(e: Effect.Effect<A, E>) => {
  const r = await Effect.runPromise(Effect.result(e));
  return r._tag === 'Failure' ? r.failure : undefined;
};

describe('politique du verrou (pure)', () => {
  const lock: LockRecord = { userId: 'alice', sessionId: 's1', lockedAt: t0, expiresAt: later(1000) };
  it('libre / à soi / détenu / expiré', () => {
    expect(lockState(null, alice, t0)).toBe('free');
    expect(lockState(lock, alice, t0)).toBe('own');
    expect(lockState(lock, bob, t0)).toBe('held');
    expect(lockState(lock, aliceOtherTab, t0)).toBe('held');
    expect(lockState(lock, { userId: 'alice', sessionId: null }, t0)).toBe('own');
    expect(lockState(lock, bob, later(1000))).toBe('expired');
  });
});

describe('service de verrou générique', () => {
  it('acquisition, renouvellement par le propriétaire, refus pour un autre (LockHeldError → CONFLICT)', async () => {
    const { store } = memoryStore();
    registerLockStore('test-a', store, { ttlMs: 1000 });
    const ok = await Effect.runPromise(acquireLock({ resourceType: 'test-a', resourceId: 'r1', owner: alice }, t0));
    expect(ok.expiresAt).toEqual(later(1000));
    await Effect.runPromise(acquireLock({ resourceType: 'test-a', resourceId: 'r1', owner: alice }, later(500)));
    const err = await failure(acquireLock({ resourceType: 'test-a', resourceId: 'r1', owner: bob, locale: 'en' }, later(600)));
    expect(err).toBeInstanceOf(LockHeldError);
    expect((err as LockHeldError).message).toBe('This content is being edited by another editor.');
    expect((toActionError(err) as { code: string }).code).toBe('CONFLICT');
  });

  it('un verrou expiré ne bloque pas et est purgé', async () => {
    const { rows, store } = memoryStore();
    registerLockStore('test-b', store, { ttlMs: 1000 });
    await Effect.runPromise(acquireLock({ resourceType: 'test-b', resourceId: 'r1', owner: alice }, t0));
    await Effect.runPromise(ensureNotLockedByOther({ resourceType: 'test-b', resourceId: 'r1', owner: bob }, later(1000)));
    expect(rows.has('r1')).toBe(false);
    await Effect.runPromise(acquireLock({ resourceType: 'test-b', resourceId: 'r1', owner: bob }, later(1001)));
    expect(rows.get('r1')?.userId).toBe('bob');
  });

  it('écriture refusée si un autre détient le verrou, y compris une autre session du même utilisateur', async () => {
    const { store } = memoryStore();
    registerLockStore('test-c', store);
    await Effect.runPromise(acquireLock({ resourceType: 'test-c', resourceId: 'r1', owner: alice }, t0));
    expect(await failure(ensureNotLockedByOther({ resourceType: 'test-c', resourceId: 'r1', owner: bob }, t0))).toBeInstanceOf(LockHeldError);
    expect(await failure(ensureNotLockedByOther({ resourceType: 'test-c', resourceId: 'r1', owner: aliceOtherTab }, t0))).toBeInstanceOf(LockHeldError);
    await Effect.runPromise(ensureNotLockedByOther({ resourceType: 'test-c', resourceId: 'r1', owner: alice }, t0));
    expect(await failure(ensureNoneLockedByOther('test-c', ['r0', 'r1'], bob, undefined, t0))).toBeInstanceOf(LockHeldError);
  });

  it('requireOwnLock : LockExpiredError si absent/expiré, LockHeldError si à un autre', async () => {
    const { store } = memoryStore();
    registerLockStore('test-d', store, { ttlMs: 1000 });
    expect(await failure(requireOwnLock({ resourceType: 'test-d', resourceId: 'r1', owner: alice }, t0))).toBeInstanceOf(LockExpiredError);
    await Effect.runPromise(acquireLock({ resourceType: 'test-d', resourceId: 'r1', owner: alice }, t0));
    await Effect.runPromise(requireOwnLock({ resourceType: 'test-d', resourceId: 'r1', owner: alice }, later(10)));
    expect(await failure(requireOwnLock({ resourceType: 'test-d', resourceId: 'r1', owner: bob }, later(10)))).toBeInstanceOf(LockHeldError);
    expect(await failure(requireOwnLock({ resourceType: 'test-d', resourceId: 'r1', owner: alice }, later(1000)))).toBeInstanceOf(LockExpiredError);
  });

  it('concurrence : de N acquisitions simultanées, une seule réussit', async () => {
    const { store } = memoryStore();
    registerLockStore('test-e', store);
    const owners = Array.from({ length: 10 }, (_, i) => ({ userId: `u${i}`, sessionId: `s${i}` }));
    const results = await Promise.all(owners.map((owner) => Effect.runPromise(Effect.result(acquireLock({ resourceType: 'test-e', resourceId: 'r1', owner }, t0)))));
    expect(results.filter((r) => r._tag === 'Success')).toHaveLength(1);
    expect(results.filter((r) => r._tag === 'Failure' && r.failure instanceof LockHeldError)).toHaveLength(9);
  });

  it('libération réservée au propriétaire ; type non enregistré = défaut explicite', async () => {
    const { rows, store } = memoryStore();
    registerLockStore('test-f', store);
    await Effect.runPromise(acquireLock({ resourceType: 'test-f', resourceId: 'r1', owner: alice }, t0));
    await Effect.runPromise(releaseLock({ resourceType: 'test-f', resourceId: 'r1', owner: bob }));
    expect(rows.has('r1')).toBe(true);
    await Effect.runPromise(releaseLock({ resourceType: 'test-f', resourceId: 'r1', owner: alice }));
    expect(rows.has('r1')).toBe(false);
    const exit = await Effect.runPromiseExit(acquireLock({ resourceType: 'inconnu', resourceId: 'x', owner: alice }));
    expect(exit._tag).toBe('Failure');
  });
});
