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

/** Confirmation affichée avant une reprise de son propre verrou depuis une autre session. */
const TAKEOVER: Record<LockLocale, string> = {
  fr: 'Vous éditez déjà ce contenu dans une autre session — reprendre ici ?',
  en: 'You are already editing this content in another session — take over here?',
  es: 'Ya está editando este contenido en otra sesión — ¿retomar aquí?',
  ar: 'أنت تحرر هذا المحتوى بالفعل في جلسة أخرى — هل تريد المتابعة هنا؟',
};

const pick = (table: Record<LockLocale, string>, locale?: string) => table[(locale as LockLocale) in table ? (locale as LockLocale) : 'fr'];

/** Verrou actif détenu par un autre propriétaire. */
export class LockHeldError extends Data.TaggedError('LockHeldError')<{
  readonly resourceType: string;
  readonly resourceId: string;
  readonly expiresAt: Date;
  /** Verrou détenu par le même utilisateur dans une autre session : reprise possible (`takeOver`). */
  readonly sameUser?: boolean;
  readonly locale?: string;
}> {
  override get message() {
    return pick(this.sameUser ? TAKEOVER : HELD, this.locale);
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

export const lockMessages = { held: HELD, expired: EXPIRED, takeOver: TAKEOVER } as const;
export const lockMessage = (kind: keyof typeof lockMessages, locale?: string) => pick(lockMessages[kind], locale);

/** Locale des messages de verrou déduite de la requête (`accept-language`, défaut `fr`). */
export function lockLocaleFrom(headers: Headers): LockLocale {
  const candidate = headers.get('accept-language')?.split(',', 1)[0]?.split('-', 1)[0]?.toLowerCase() ?? 'fr';
  return (['fr', 'en', 'es', 'ar'] as const).includes(candidate as LockLocale) ? (candidate as LockLocale) : 'fr';
}
