export interface EditorialLock {
  readonly resourceId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly lockedAt: Date;
  readonly expiresAt: Date;
}

export function isEditorialLockExpired(lock: EditorialLock, now = new Date()): boolean {
  return lock.expiresAt.getTime() <= now.getTime();
}

export function assertEditorialLock(lock: EditorialLock): void {
  if (!lock.resourceId.trim()) throw new Error("Lock resourceId cannot be empty");
  if (!lock.userId.trim()) throw new Error("Lock userId cannot be empty");
  if (!lock.sessionId.trim()) throw new Error("Lock sessionId cannot be empty");
  if (lock.expiresAt.getTime() <= lock.lockedAt.getTime()) {
    throw new Error("Lock expiresAt must be later than lockedAt");
  }
}
