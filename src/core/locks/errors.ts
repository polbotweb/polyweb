/**
 * Erreurs typées du verrou d'édition générique (src/core/locks), messages i18n
 * cohérents pour tous les modules. `toActionError` les traduit en `CONFLICT`.
 */
import { Data } from 'effect';

export type LockLocale = 'fr' | 'en' | 'es' | 'ar';

const HELD: Record<LockLocale, string> = {
  fr: 'Ce contenu est en cours d’édition par un autre éditeur.',
  en: 'This content is being edited by another editor.',
  es: 'Este contenido está siendo editado por otro editor.',
  ar: 'يقوم محرر آخر بتعديل هذا المحتوى حاليًا.',
};

const EXPIRED: Record<LockLocale, string> = {
  fr: 'Le verrou de modification est requis (absent ou expiré).',
  en: 'An edit lock is required (missing or expired).',
  es: 'Se requiere un bloqueo de edición (ausente o caducado).',
  ar: 'يلزم قفل التعديل (غير موجود أو منتهي الصلاحية).',
};

const pick = (table: Record<LockLocale, string>, locale?: string) => table[(locale as LockLocale) in table ? (locale as LockLocale) : 'fr'];

/** Verrou actif détenu par un autre propriétaire. */
export class LockHeldError extends Data.TaggedError('LockHeldError')<{
  readonly resourceType: string;
  readonly resourceId: string;
  readonly expiresAt: Date;
  readonly locale?: string;
}> {
  override get message() {
    return pick(HELD, this.locale);
  }
}

/** Verrou exigé mais absent ou expiré (ex. restauration de révision). */
export class LockExpiredError extends Data.TaggedError('LockExpiredError')<{
  readonly resourceType: string;
  readonly resourceId: string;
  readonly locale?: string;
}> {
  override get message() {
    return pick(EXPIRED, this.locale);
  }
}

export const lockMessages = { held: HELD, expired: EXPIRED } as const;
