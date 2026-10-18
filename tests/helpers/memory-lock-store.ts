/** Stockage de verrous en mémoire, au comportement atomique identique au stockage Drizzle (tests). */
import { Effect } from 'effect';
import type { LockOwner, LockRecord } from '@/core/locks/policy';
import type { LockStore } from '@/core/locks/service';

export function memoryLockStore(rows: Map<string, LockRecord> = new Map()) {
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
    takeOver: (id, o, expiresAt, now) =>
      Effect.sync(() => {
        const cur = rows.get(id);
        if (!cur || cur.userId !== o.userId) return null;
        rows.set(id, { userId: o.userId, sessionId: o.sessionId ?? '', lockedAt: now, expiresAt });
        return cur.sessionId;
      }),
    forceRelease: (id) => Effect.sync(() => { rows.delete(id); }),
  };
  return { rows, store };
}
