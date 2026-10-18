import { toLocale, getAuthTranslations } from '@i18n/utils';
import type { Locale } from '@i18n/config';
import { auth } from '@/lib/auth';
import type { statement } from '@/lib/permissions';

type Statement = typeof statement;
type Permissions = { [K in keyof Statement]?: Statement[K][number][] };

interface AstroContext {
  params: Record<string, string | undefined>;
  locals: App.Locals;
  redirect: (url: string, status?: 300 | 301 | 302 | 303 | 304 | 307 | 308) => Response;
}

async function resolveLocale(astro: AstroContext) {
  const locale = toLocale(astro.params.lang) as Locale;
  const authT = await getAuthTranslations(locale);
  return { locale, authT };
}

function signInUrl(locale: Locale, authT: { routes: Record<string, string> }) {
  return `/${locale}/auth/${authT.routes['sign-in']}`;
}

function dashboardUrl(locale: Locale, authT: { routes: Record<string, string> }) {
  return `/${locale}/auth/${authT.routes['dashboard']}`;
}

/** Require authenticated user. Redirects guests to sign-in, banned users to sign-in. */
export async function requireAuth(astro: AstroContext) {
  const { locale, authT } = await resolveLocale(astro);
  const user = astro.locals.user;
  if (!user || user.banned) {
    return { redirect: astro.redirect(signInUrl(locale, authT)) };
  }
  return { user, locale, authT };
}

/** Require admin role. Redirects guests/banned to sign-in, non-admins to dashboard. */
export async function requireAdmin(astro: AstroContext) {
  const { locale, authT } = await resolveLocale(astro);
  const user = astro.locals.user;
  if (!user || user.banned) {
    return { redirect: astro.redirect(signInUrl(locale, authT)) };
  }
  if (user.role !== 'admin') {
    return { redirect: astro.redirect(dashboardUrl(locale, authT)) };
  }
  return { user, locale, authT };
}

/**
 * Require specific CMS permissions (RBAC). Redirects if permission denied.
 *
 * @see src/lib/permissions.ts — définitions des statements et rôles
 */
export async function requirePermission(astro: AstroContext, permissions: Permissions) {
  const { locale, authT } = await resolveLocale(astro);
  const user = astro.locals.user;
  if (!user || user.banned) {
    return { redirect: astro.redirect(signInUrl(locale, authT)) };
  }

  const result = await auth.api.userHasPermission({
    body: {
      userId: user.id,
      permissions: permissions as Record<string, string[]>,
    },
  });

  if (!result.success) {
    return { redirect: astro.redirect(dashboardUrl(locale, authT)) };
  }

  return { user, locale, authT };
}
