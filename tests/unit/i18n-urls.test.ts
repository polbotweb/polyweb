import { describe, it, expect } from 'vitest';
import {
  getAuthUrl,
  resolveAuthSlug,
  getPageUrl,
  resolvePageSlug,
  getAuthTranslations,
  getCommonTranslations,
  getAdminUrl,
  getOrgUrl,
  toLocale,
  isValidLocale,
  isRTL,
  getDirection,
} from '@/i18n/utils';
import type { Locale, AuthPageId, PageId } from '@/i18n/config';

// ─── Expected route mappings per locale ─────────────────────────────

const AUTH_ROUTES: Record<Locale, Record<AuthPageId, string>> = {
  fr: {
    'sign-in': 'connexion',
    'sign-up': 'inscription',
    dashboard: 'tableau-de-bord',
    admin: 'administration',
    'forgot-password': 'mot-de-passe-oublie',
    'reset-password': 'reinitialiser-mot-de-passe',
    'verify-email': 'verifier-email',
    profile: 'profil',
    organizations: 'organisations',
  },
  en: {
    'sign-in': 'sign-in',
    'sign-up': 'sign-up',
    dashboard: 'dashboard',
    admin: 'admin',
    'forgot-password': 'forgot-password',
    'reset-password': 'reset-password',
    'verify-email': 'verify-email',
    profile: 'profile',
    organizations: 'organizations',
  },
  es: {
    'sign-in': 'iniciar-sesion',
    'sign-up': 'registro',
    dashboard: 'panel',
    admin: 'administracion',
    'forgot-password': 'contrasena-olvidada',
    'reset-password': 'restablecer-contrasena',
    'verify-email': 'verificar-correo',
    profile: 'perfil',
    organizations: 'organizaciones',
  },
  ar: {
    'sign-in': 'تسجيل-الدخول',
    'sign-up': 'انشاء-حساب',
    dashboard: 'لوحة-التحكم',
    admin: 'الادارة',
    'forgot-password': 'نسيت-كلمة-المرور',
    'reset-password': 'اعادة-تعيين-كلمة-المرور',
    'verify-email': 'تاكيد-البريد',
    profile: 'الملف-الشخصي',
    organizations: 'المؤسسات',
  },
};

const PAGE_ROUTES: Record<'fr' | 'en', Record<PageId, string>> = {
  fr: { about: 'a-propos', contact: 'contact', legal: 'mentions-legales' },
  en: { about: 'about', contact: 'contact', legal: 'legal-notice' },
};

const AUTH_PAGE_IDS: AuthPageId[] = [
  'sign-in', 'sign-up', 'dashboard', 'admin',
  'forgot-password', 'reset-password', 'verify-email',
  'profile', 'organizations',
];

const LOCALES: Locale[] = ['fr', 'en', 'es', 'ar'];

// ─── getAuthUrl ─────────────────────────────────────────────────────

describe('getAuthUrl', () => {
  it.each(LOCALES)('generates correct auth URLs for locale %s', async (locale) => {
    const t = await getAuthTranslations(locale);
    for (const pageId of AUTH_PAGE_IDS) {
      const url = getAuthUrl(locale, pageId, t);
      const expectedSlug = AUTH_ROUTES[locale][pageId];
      expect(url).toBe(`/${locale}/auth/${expectedSlug}`);
    }
  });
});

// ─── resolveAuthSlug ────────────────────────────────────────────────

describe('resolveAuthSlug', () => {
  it.each(LOCALES)('resolves all auth slugs back to pageId for locale %s', async (locale) => {
    const t = await getAuthTranslations(locale);
    for (const pageId of AUTH_PAGE_IDS) {
      const slug = AUTH_ROUTES[locale][pageId];
      expect(resolveAuthSlug(slug, t)).toBe(pageId);
    }
  });

  it('returns null for an unknown slug', async () => {
    const t = await getAuthTranslations('fr');
    expect(resolveAuthSlug('inexistant', t)).toBeNull();
    expect(resolveAuthSlug('', t)).toBeNull();
  });
});

// ─── getPageUrl ─────────────────────────────────────────────────────

describe('getPageUrl', () => {
  it.each(['fr', 'en'] as const)('generates correct page URLs for locale %s', async (locale) => {
    const t = await getCommonTranslations(locale);
    for (const [pageId, slug] of Object.entries(PAGE_ROUTES[locale])) {
      const url = getPageUrl(locale, pageId as PageId, t);
      expect(url).toBe(`/${locale}/${slug}`);
    }
  });
});

// ─── resolvePageSlug ────────────────────────────────────────────────

describe('resolvePageSlug', () => {
  it.each(['fr', 'en'] as const)('resolves all page slugs back to pageId for locale %s', async (locale) => {
    const t = await getCommonTranslations(locale);
    for (const [pageId, slug] of Object.entries(PAGE_ROUTES[locale])) {
      expect(resolvePageSlug(slug, t)).toBe(pageId);
    }
  });

  it('returns null for an unknown slug', async () => {
    const t = await getCommonTranslations('fr');
    expect(resolvePageSlug('inexistant', t)).toBeNull();
  });
});

// ─── get*Translations loaders ───────────────────────────────────────

describe('Translation loaders', () => {
  it.each(LOCALES)('getAuthTranslations(%s) returns valid routes object', async (locale) => {
    const t = await getAuthTranslations(locale);
    expect(t.routes).toBeDefined();
    for (const pageId of AUTH_PAGE_IDS) {
      expect(typeof t.routes[pageId]).toBe('string');
      expect(t.routes[pageId].length).toBeGreaterThan(0);
    }
  });

  it.each(LOCALES)('getCommonTranslations(%s) returns valid nav and pageRoutes', async (locale) => {
    const t = await getCommonTranslations(locale);
    expect(t.nav).toBeDefined();
    expect(t.pageRoutes).toBeDefined();
    expect(typeof t.pageRoutes.about).toBe('string');
    expect(typeof t.pageRoutes.contact).toBe('string');
    expect(typeof t.pageRoutes.legal).toBe('string');
  });
});

// ─── getAdminUrl ────────────────────────────────────────────────────

describe('getAdminUrl', () => {
  it('generates base admin URL without subpage', () => {
    expect(getAdminUrl('fr')).toBe('/fr/admin');
    expect(getAdminUrl('en')).toBe('/en/admin');
  });

  it('generates admin URL with subpage', () => {
    expect(getAdminUrl('fr', 'users')).toBe('/fr/admin/users');
    expect(getAdminUrl('fr', 'blog')).toBe('/fr/admin/blog');
    expect(getAdminUrl('en', 'audit')).toBe('/en/admin/audit');
    expect(getAdminUrl('es', 'theme')).toBe('/es/admin/theme');
  });
});

// ─── getOrgUrl ──────────────────────────────────────────────────────

describe('getOrgUrl', () => {
  it('generates base org URL without subpage', () => {
    expect(getOrgUrl('fr', 'my-org')).toBe('/fr/organizations/my-org');
  });

  it('generates org URL with subpage', () => {
    expect(getOrgUrl('en', 'acme', 'members')).toBe('/en/organizations/acme/members');
    expect(getOrgUrl('en', 'acme', 'blog')).toBe('/en/organizations/acme/admin/blog');
    expect(getOrgUrl('fr', 'acme', 'settings')).toBe('/fr/organizations/acme/settings');
  });
});

// ─── toLocale ───────────────────────────────────────────────────────

describe('toLocale', () => {
  it('returns valid locale as-is', () => {
    expect(toLocale('fr')).toBe('fr');
    expect(toLocale('en')).toBe('en');
    expect(toLocale('ar')).toBe('ar');
  });

  it('returns default locale for invalid value', () => {
    expect(toLocale('xx')).toBe('fr');
    expect(toLocale(undefined)).toBe('fr');
    expect(toLocale('')).toBe('fr');
  });
});

// ─── isValidLocale ──────────────────────────────────────────────────

describe('isValidLocale', () => {
  it('returns true for supported locales', () => {
    expect(isValidLocale('fr')).toBe(true);
    expect(isValidLocale('en')).toBe(true);
    expect(isValidLocale('es')).toBe(true);
    expect(isValidLocale('ar')).toBe(true);
  });

  it('returns false for unsupported values', () => {
    expect(isValidLocale('de')).toBe(false);
    expect(isValidLocale(undefined)).toBe(false);
    expect(isValidLocale('')).toBe(false);
  });
});

// ─── isRTL / getDirection ───────────────────────────────────────────

describe('isRTL / getDirection', () => {
  it('Arabic is RTL', () => {
    expect(isRTL('ar')).toBe(true);
    expect(getDirection('ar')).toBe('rtl');
  });

  it('French/English/Spanish are LTR', () => {
    for (const locale of ['fr', 'en', 'es'] as const) {
      expect(isRTL(locale)).toBe(false);
      expect(getDirection(locale)).toBe('ltr');
    }
  });
});
