/**
 * Gardes des pages `.astro` (session, rôle admin, permissions RBAC) en Effect.
 * Résultat : `{ redirect }` ou `{ user, locale, authT }`. Les fonctions `async`
 * historiques (`requireAuth`, …) sont des adaptateurs.
 */
import { toLocale, getAuthTranslations } from '@i18n/utils';
import type { Locale } from '@i18n/config';
import { Effect } from 'effect';
import { auth } from '@/lib/auth';
import { DbError } from '@/lib/effect/errors';
import type { statement } from '@/lib/permissions';

type Statement = typeof statement;
type Permissions = { [K in keyof Statement]?: Statement[K][number][] };

interface AstroContext {
  params: Record<string, string | undefined>;
  locals: App.Locals;
  redirect: (url: string, status?: 300 | 301 | 302 | 303 | 304 | 307 | 308) => Response;
}

const resolveLocale = (astro: AstroContext) =>
  Effect.promise(async () => {
    const locale = toLocale(astro.params.lang) as Locale;
    const authT = await getAuthTranslations(locale);
    return { locale, authT };
  });

function signInUrl(locale: Locale, authT: { routes: Record<string, string> }) {
  return `/${locale}/auth/${authT.routes['sign-in']}`;
}

function dashboardUrl(locale: Locale, authT: { routes: Record<string, string> }) {
  return `/${locale}/auth/${authT.routes['dashboard']}`;
}

/** Utilisateur connecté requis (invités et comptes bannis → connexion). */
export const requireAuthEffect = (astro: AstroContext) =>
  Effect.gen(function* () {
    const { locale, authT } = yield* resolveLocale(astro);
    const user = astro.locals.user;
    if (!user || user.banned) return { redirect: astro.redirect(signInUrl(locale, authT)) };
    return { user, locale, authT };
  });

/** Rôle admin requis (invités/bannis → connexion, non-admins → tableau de bord). */
export const requireAdminEffect = (astro: AstroContext) =>
  Effect.gen(function* () {
    const { locale, authT } = yield* resolveLocale(astro);
    const user = astro.locals.user;
    if (!user || user.banned) return { redirect: astro.redirect(signInUrl(locale, authT)) };
    if (user.role !== 'admin') return { redirect: astro.redirect(dashboardUrl(locale, authT)) };
    return { user, locale, authT };
  });

/**
 * Permissions CMS requises (RBAC better-auth). Échec de l'appel → `DbError`.
 * @see src/lib/permissions.ts — définitions des statements et rôles
 */
export const requirePermissionEffect = (astro: AstroContext, permissions: Permissions) =>
  Effect.gen(function* () {
    const { locale, authT } = yield* resolveLocale(astro);
    const user = astro.locals.user;
    if (!user || user.banned) return { redirect: astro.redirect(signInUrl(locale, authT)) };
    const result = yield* Effect.tryPromise({
      try: () => auth.api.userHasPermission({ body: { userId: user.id, permissions: permissions as Record<string, string[]> } }),
      catch: (cause) => new DbError({ operation: 'auth.userHasPermission', cause }),
    });
    if (!result.success) return { redirect: astro.redirect(dashboardUrl(locale, authT)) };
    return { user, locale, authT };
  });

const run = async <A>(effect: Effect.Effect<A, DbError>): Promise<A> => {
  const r = await Effect.runPromise(Effect.result(effect));
  if (r._tag === 'Success') return r.success;
  throw r.failure.cause;
};

export const requireAuth = (astro: AstroContext) => run(requireAuthEffect(astro));
export const requireAdmin = (astro: AstroContext) => run(requireAdminEffect(astro));
export const requirePermission = (astro: AstroContext, permissions: Permissions) => run(requirePermissionEffect(astro, permissions));
