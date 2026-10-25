/**
 * Politique unique du verrou d'édition (pure, testable) :
 * - propriétaire = utilisateur + session ; si la session de l'appelant est
 *   inconnue (`null`), seul l'utilisateur est comparé ;
 * - un verrou expiré (`expiresAt <= now`) ne bloque jamais et est purgé.
 */
export interface LockOwner {
  readonly userId: string;
  readonly sessionId: string | null;
}

export interface LockRecord {
  readonly userId: string;
  readonly sessionId: string;
  readonly lockedAt: Date;
  readonly expiresAt: Date;
}

export type LockState = 'free' | 'expired' | 'own' | 'held';

export function lockState(lock: LockRecord | null | undefined, owner: LockOwner, now = new Date()): LockState {
  if (!lock) return 'free';
  if (lock.expiresAt.getTime() <= now.getTime()) return 'expired';
  const sameUser = lock.userId === owner.userId;
  const sameSession = owner.sessionId === null || lock.sessionId === owner.sessionId;
  return sameUser && sameSession ? 'own' : 'held';
}

/** Durée par défaut d'un verrou (30 min), surchargeable par ressource. */
export const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;
