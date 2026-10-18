/**
 * Verrou d'édition générique (Effect), indépendant de l'entité : une ressource est
 * identifiée par `resourceType` + `resourceId`, chaque module enregistre son
 * stockage (`registerLockStore`). Les tables existantes (`service_locks`,
 * `blog_post_locks`) partagent la forme `{ <ressource>, userId, sessionId,
 * lockedAt, expiresAt }` : `drizzleLockStore` en fait un stockage sans migration.
 *
 * Garanties :
 * - acquisition atomique : `INSERT … ON CONFLICT DO UPDATE … WHERE` (verrou expiré
 *   ou déjà détenu par le même propriétaire) — deux éditeurs concurrents ne peuvent
 *   pas obtenir le verrou en même temps ;
 * - verrou expiré purgé à la vérification ;
 * - échecs typés `LockHeldError` / `LockExpiredError`, infrastructure `DbError`.
 */
import { Effect } from 'effect';
import { and, eq, inArray, lte, or, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { getDrizzle } from '@/database/drizzle';
import type { DbError } from '@/lib/effect/errors';
import { dbTry } from '@/lib/effect/run';
import { LockExpiredError, LockHeldError } from './errors';
import { DEFAULT_LOCK_TTL_MS, lockState, type LockOwner, type LockRecord } from './policy';

export interface LockStore {
  readonly read: (resourceId: string) => Effect.Effect<LockRecord | null, DbError>;
  readonly readMany: (resourceIds: readonly string[]) => Effect.Effect<(LockRecord & { resourceId: string })[], DbError>;
  /** Pose/renouvelle le verrou si libre, expiré ou déjà à `owner` ; `false` sinon (atomique). */
  readonly tryAcquire: (resourceId: string, owner: LockOwner, expiresAt: Date, now: Date) => Effect.Effect<boolean, DbError>;
  readonly release: (resourceId: string, owner: LockOwner) => Effect.Effect<void, DbError>;
  readonly purgeExpired: (resourceId: string, now: Date) => Effect.Effect<void, DbError>;
  /** Reprise par le même utilisateur depuis une autre session (atomique) ; session précédente ou `null`. */
  readonly takeOver: (resourceId: string, owner: LockOwner, expiresAt: Date, now: Date) => Effect.Effect<string | null, DbError>;
  /** Libération administrative (quel que soit le propriétaire). */
  readonly forceRelease: (resourceId: string) => Effect.Effect<void, DbError>;
}

type LockColumns = { userId: AnyPgColumn; sessionId: AnyPgColumn; lockedAt: AnyPgColumn; expiresAt: AnyPgColumn };

/** Stockage Drizzle pour une table `{ [resourceKey], userId, sessionId, lockedAt, expiresAt }` (clé unique sur la ressource). */
export function drizzleLockStore<T extends PgTable & LockColumns, K extends keyof T & string>(resourceType: string, table: T, resourceKey: K): LockStore {
  const resource = table[resourceKey] as unknown as AnyPgColumn;
  const ownerMatch = (owner: LockOwner): SQL =>
    owner.sessionId === null ? eq(table.userId, owner.userId) : and(eq(table.userId, owner.userId), eq(table.sessionId, owner.sessionId))!;
  const op = (name: string) => `lock.${resourceType}.${name}`;
  const db = () => getDrizzle() as unknown as {
    select: (fields?: unknown) => { from: (t: PgTable) => { where: (w: SQL | undefined) => Promise<Record<string, unknown>[]> & { limit: (n: number) => Promise<Record<string, unknown>[]> } } };
    insert: (t: PgTable) => { values: (v: Record<string, unknown>) => { onConflictDoUpdate: (c: { target: AnyPgColumn; set: Record<string, unknown>; setWhere: SQL }) => { returning: (f: Record<string, AnyPgColumn>) => Promise<unknown[]> } } };
    delete: (t: PgTable) => { where: (w: SQL | undefined) => Promise<unknown> };
    update: (t: PgTable) => { set: (v: Record<string, unknown>) => { where: (w: SQL | undefined) => { returning: (f: Record<string, AnyPgColumn>) => Promise<{ sessionId: string }[]> } } };
  };
  const fields = { resourceId: resource, userId: table.userId, sessionId: table.sessionId, lockedAt: table.lockedAt, expiresAt: table.expiresAt };
  return {
    read: (resourceId) =>
      dbTry(op('read'), () => db().select(fields).from(table).where(eq(resource, resourceId)).limit(1)).pipe(
        Effect.map(([row]) => (row as unknown as LockRecord) ?? null),
      ),
    readMany: (resourceIds) =>
      resourceIds.length === 0
        ? Effect.succeed([])
        : dbTry(op('readMany'), () => db().select(fields).from(table).where(inArray(resource, [...resourceIds]))).pipe(
            Effect.map((rows) => rows as unknown as (LockRecord & { resourceId: string })[]),
          ),
    tryAcquire: (resourceId, owner, expiresAt, now) =>
      dbTry(op('acquire'), () =>
        db()
          .insert(table)
          .values({ [resourceKey]: resourceId, userId: owner.userId, sessionId: owner.sessionId ?? '', lockedAt: now, expiresAt })
          .onConflictDoUpdate({
            target: resource,
            set: { userId: owner.userId, sessionId: owner.sessionId ?? '', lockedAt: now, expiresAt },
            setWhere: or(lte(table.expiresAt, now), ownerMatch(owner))!,
          })
          .returning({ resourceId: resource }),
      ).pipe(Effect.map((rows) => rows.length === 1)),
    release: (resourceId, owner) => dbTry(op('release'), () => db().delete(table).where(and(eq(resource, resourceId), ownerMatch(owner)))).pipe(Effect.asVoid),
    purgeExpired: (resourceId, now) => dbTry(op('purge'), () => db().delete(table).where(and(eq(resource, resourceId), lte(table.expiresAt, now)))).pipe(Effect.asVoid),
    takeOver: (resourceId, owner, expiresAt, now) =>
      Effect.gen(function* () {
        const [before] = yield* dbTry(op('takeOver.read'), () => db().select({ sessionId: table.sessionId }).from(table).where(and(eq(resource, resourceId), eq(table.userId, owner.userId))).limit(1));
        const rows = yield* dbTry(op('takeOver'), () =>
          db().update(table).set({ sessionId: owner.sessionId ?? '', lockedAt: now, expiresAt }).where(and(eq(resource, resourceId), eq(table.userId, owner.userId))).returning({ sessionId: table.sessionId }),
        );
        return rows.length === 1 ? ((before?.sessionId as string | undefined) ?? null) : null;
      }),
    forceRelease: (resourceId) => dbTry(op('forceRelease'), () => db().delete(table).where(eq(resource, resourceId))).pipe(Effect.asVoid),
  };
}

// ─── Registre (un stockage par type de ressource, déclaré par chaque module) ───

const stores = new Map<string, { store: LockStore; ttlMs: number }>();

export function registerLockStore(resourceType: string, store: LockStore, options: { ttlMs?: number } = {}): void {
  stores.set(resourceType, { store, ttlMs: options.ttlMs ?? DEFAULT_LOCK_TTL_MS });
}

const entry = (resourceType: string) =>
  Effect.suspend(() => {
    const found = stores.get(resourceType);
    return found ? Effect.succeed(found) : Effect.die(new Error(`Aucun stockage de verrou enregistré pour « ${resourceType} »`));
  });

export interface LockRequest {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly owner: LockOwner;
  readonly locale?: string;
}

/**
 * Acquiert ou renouvelle le verrou. Détenu par un autre utilisateur → `LockHeldError`.
 * Détenu par le même utilisateur dans une autre session → `LockHeldError { sameUser: true }`
 * (message de confirmation « reprendre ici ? »), sauf si `takeOver` : la session courante
 * reprend le verrou et `tookOverFrom` indique la session évincée (à auditer par l'appelant).
 */
export const acquireLock = ({ resourceType, resourceId, owner, locale }: LockRequest, options: { takeOver?: boolean; now?: Date } = {}) =>
  Effect.gen(function* () {
    const now = options.now ?? new Date();
    const { store, ttlMs } = yield* entry(resourceType);
    const expiresAt = new Date(now.getTime() + ttlMs);
    if (yield* store.tryAcquire(resourceId, owner, expiresAt, now)) return { expiresAt, tookOverFrom: null as string | null };
    const current = yield* store.read(resourceId);
    const sameUser = !!current && current.userId === owner.userId && current.expiresAt > now;
    if (sameUser && options.takeOver) {
      const previous = yield* store.takeOver(resourceId, owner, expiresAt, now);
      if (previous !== null) return { expiresAt, tookOverFrom: previous };
    }
    return yield* Effect.fail(new LockHeldError({ resourceType, resourceId, expiresAt: current?.expiresAt ?? expiresAt, sameUser, locale }));
  }).pipe(Effect.withSpan(`lock.acquire ${resourceType}`));

/** Libération administrative (verrou d'un autre éditeur) — à réserver aux administrateurs et à auditer. */
export const forceReleaseLock = (resourceType: string, resourceId: string) =>
  Effect.flatMap(entry(resourceType), ({ store }) => store.forceRelease(resourceId));

/** Libère le verrou s'il appartient à `owner` (sans effet sinon). */
export const releaseLock = ({ resourceType, resourceId, owner }: LockRequest) =>
  Effect.flatMap(entry(resourceType), ({ store }) => store.release(resourceId, owner));

/**
 * Écriture autorisée si aucun verrou actif d'un autre propriétaire : libre, à soi,
 * ou expiré (purgé). Sinon `LockHeldError`.
 */
export const ensureNotLockedByOther = ({ resourceType, resourceId, owner, locale }: LockRequest, now = new Date()) =>
  Effect.gen(function* () {
    const { store } = yield* entry(resourceType);
    const lock = yield* store.read(resourceId);
    const state = lockState(lock, owner, now);
    if (state === 'expired') yield* store.purgeExpired(resourceId, now);
    if (state === 'held') return yield* Effect.fail(new LockHeldError({ resourceType, resourceId, expiresAt: lock!.expiresAt, sameUser: lock!.userId === owner.userId, locale }));
  });

/** Variante groupée (actions en masse) : échoue au premier verrou actif d'un autre. */
export const ensureNoneLockedByOther = (resourceType: string, resourceIds: readonly string[], owner: LockOwner, locale?: string, now = new Date()) =>
  Effect.gen(function* () {
    const { store } = yield* entry(resourceType);
    for (const lock of yield* store.readMany(resourceIds)) {
      if (lockState(lock, owner, now) === 'held') return yield* Effect.fail(new LockHeldError({ resourceType, resourceId: lock.resourceId, expiresAt: lock.expiresAt, locale }));
    }
  });

/** Exige un verrou actif détenu par `owner` (ex. restauration de révision). */
export const requireOwnLock = ({ resourceType, resourceId, owner, locale }: LockRequest, now = new Date()) =>
  Effect.gen(function* () {
    const { store } = yield* entry(resourceType);
    const lock = yield* store.read(resourceId);
    const state = lockState(lock, owner, now);
    if (state === 'own') return lock!;
    if (state === 'held') return yield* Effect.fail(new LockHeldError({ resourceType, resourceId, expiresAt: lock!.expiresAt, locale }));
    return yield* Effect.fail(new LockExpiredError({ resourceType, resourceId, locale }));
  });

/** Propriétaire courant d'une action Astro (utilisateur + session si connue). */
export const lockOwnerFrom = (userId: string, sessionId: string | null | undefined): LockOwner => ({ userId, sessionId: sessionId ?? null });

/**
 * Déclare un type de ressource verrouillable et renvoie ses opérations liées —
 * c'est le point d'entrée des modules (et du scaffolding `pnpm module:new`) :
 *
 *   export const serviceLock = defineLockResource('service', drizzleLockStore('service', serviceLocks, 'serviceId'));
 *   yield* serviceLock.ensureNotLockedByOther(id, lockOwnerFrom(user.id, session?.id));
 */
export function defineLockResource(resourceType: string, store: LockStore, options: { ttlMs?: number } = {}) {
  registerLockStore(resourceType, store, options);
  const req = (resourceId: string, owner: LockOwner, locale?: string): LockRequest => ({ resourceType, resourceId, owner, locale });
  return {
    resourceType,
    acquire: (resourceId: string, owner: LockOwner, opts: { takeOver?: boolean; locale?: string; now?: Date } = {}) => acquireLock(req(resourceId, owner, opts.locale), opts),
    release: (resourceId: string, owner: LockOwner) => releaseLock(req(resourceId, owner)),
    forceRelease: (resourceId: string) => forceReleaseLock(resourceType, resourceId),
    ensureNotLockedByOther: (resourceId: string, owner: LockOwner, locale?: string) => ensureNotLockedByOther(req(resourceId, owner, locale)),
    ensureNoneLockedByOther: (resourceIds: readonly string[], owner: LockOwner, locale?: string) => ensureNoneLockedByOther(resourceType, resourceIds, owner, locale),
    requireOwn: (resourceId: string, owner: LockOwner, locale?: string) => requireOwnLock(req(resourceId, owner, locale)),
  };
}
