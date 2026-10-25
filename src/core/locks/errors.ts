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

const RELEASE_FORBIDDEN: Record<LockLocale, string> = {
  fr: 'Seul un administrateur global, ou un administrateur de l’organisation propriétaire, peut libérer ce verrou.',
  en: 'Only a global administrator, or an administrator of the owning organization, can release this lock.',
  es: 'Solo un administrador global, o un administrador de la organización propietaria, puede liberar este bloqueo.',
  ar: 'لا يمكن تحرير هذا القفل إلا لمسؤول عام أو لمسؤول المؤسسة المالكة.',
};

const RESOURCE_NOT_FOUND: Record<LockLocale, string> = {
  fr: 'Ressource verrouillable introuvable.',
  en: 'Lockable resource not found.',
  es: 'Recurso bloqueable no encontrado.',
  ar: 'المورد القابل للقفل غير موجود.',
};

/** Libération administrative refusée (ni administrateur global, ni administrateur de l'organisation de la ressource). */
export class LockReleaseForbiddenError extends Data.TaggedError('LockReleaseForbiddenError')<{
  readonly resourceType: string;
  readonly resourceId: string;
  readonly locale?: string;
}> {
  override get message() {
    return pick(RELEASE_FORBIDDEN, this.locale);
  }
}

/** Type de ressource non enregistré ou ressource absente. */
export class LockResourceNotFoundError extends Data.TaggedError('LockResourceNotFoundError')<{
  readonly resourceType: string;
  readonly resourceId: string;
  readonly locale?: string;
}> {
  override get message() {
    return pick(RESOURCE_NOT_FOUND, this.locale);
  }
}

export const lockMessages = { held: HELD, expired: EXPIRED, takeOver: TAKEOVER, releaseForbidden: RELEASE_FORBIDDEN, resourceNotFound: RESOURCE_NOT_FOUND } as const;
export const lockMessage = (kind: keyof typeof lockMessages, locale?: string) => pick(lockMessages[kind], locale);

/** Locale des messages de verrou déduite de la requête (`accept-language`, défaut `fr`). */
export function lockLocaleFrom(headers: Headers): LockLocale {
  const candidate = headers.get('accept-language')?.split(',', 1)[0]?.split('-', 1)[0]?.toLowerCase() ?? 'fr';
  return (['fr', 'en', 'es', 'ar'] as const).includes(candidate as LockLocale) ? (candidate as LockLocale) : 'fr';
}
