import {
  type Locale,
  type CommonTranslations,
  type HomeTranslations,
  type AboutTranslations,
  type ContactTranslations,
  type AuthTranslations,
  type BlogTranslations,
  type AuthPageId,
  type PageId,
  LOCALES,
  DEFAULT_LOCALE,
  RTL_LOCALES,
} from './config';

const commonModules: Record<Locale, () => Promise<{ default: CommonTranslations }>> = { fr: () => import('./fr/common'), en: () => import('./en/common'), es: () => import('./es/common'), ar: () => import('./ar/common') };
export async function getCommonTranslations(locale: Locale): Promise<CommonTranslations> { try { return (await commonModules[locale]()).default; } catch (err) { if (locale !== DEFAULT_LOCALE) return (await commonModules[DEFAULT_LOCALE]()).default; throw err; } }
const homeModules: Record<Locale, () => Promise<{ default: HomeTranslations }>> = { fr: () => import('./fr/home'), en: () => import('./en/home'), es: () => import('./es/home'), ar: () => import('./ar/home') };
export async function getHomeTranslations(locale: Locale): Promise<HomeTranslations> { try { return (await homeModules[locale]()).default; } catch (err) { if (locale !== DEFAULT_LOCALE) return (await homeModules[DEFAULT_LOCALE]()).default; throw err; } }
const aboutModules: Record<Locale, () => Promise<{ default: AboutTranslations }>> = { fr: () => import('./fr/about'), en: () => import('./en/about'), es: () => import('./es/about'), ar: () => import('./ar/about') };
export async function getAboutTranslations(locale: Locale): Promise<AboutTranslations> { try { return (await aboutModules[locale]()).default; } catch (err) { if (locale !== DEFAULT_LOCALE) return (await aboutModules[DEFAULT_LOCALE]()).default; throw err; } }
const contactModules: Record<Locale, () => Promise<{ default: ContactTranslations }>> = { fr: () => import('./fr/contact'), en: () => import('./en/contact'), es: () => import('./es/contact'), ar: () => import('./ar/contact') };
export async function getContactTranslations(locale: Locale): Promise<ContactTranslations> { try { return (await contactModules[locale]()).default; } catch (err) { if (locale !== DEFAULT_LOCALE) return (await contactModules[DEFAULT_LOCALE]()).default; throw err; } }
const authModules: Record<Locale, () => Promise<{ default: AuthTranslations }>> = { fr: () => import('./fr/auth'), en: () => import('./en/auth'), es: () => import('./es/auth'), ar: () => import('./ar/auth') };
export async function getAuthTranslations(locale: Locale): Promise<AuthTranslations> { try { return (await authModules[locale]()).default; } catch (err) { if (locale !== DEFAULT_LOCALE) return (await authModules[DEFAULT_LOCALE]()).default; throw err; } }
export function getAuthUrl(locale: Locale, pageId: AuthPageId, authTranslations: AuthTranslations): string { return `/${locale}/auth/${authTranslations.routes[pageId]}`; }
export function resolveAuthSlug(slug: string, authTranslations: AuthTranslations): AuthPageId | null { const match = (Object.entries(authTranslations.routes) as [AuthPageId, string][]).find(([, route]) => route === slug); return match?.[0] ?? null; }
export type AdminSubpage = 'stats' | 'users' | 'organizations' | 'audit' | 'roles' | 'blog' | 'services' | 'site' | 'navigation' | 'pages' | 'media' | 'theme';
export type OrgSubpage = 'members' | 'roles' | 'blog' | 'services' | 'media' | 'settings';
export function getAdminUrl(locale: Locale, subpage?: AdminSubpage): string { return subpage ? `/${locale}/admin/${subpage}` : `/${locale}/admin`; }
export function getOrgUrl(locale: Locale, orgSlug: string, subpage?: OrgSubpage): string { if (subpage === 'blog') return `/${locale}/organizations/${orgSlug}/admin/blog`; if (subpage === 'services') return `/${locale}/organizations/${orgSlug}/admin/services`; if (subpage === 'media') return `/${locale}/organizations/${orgSlug}/admin/media`; return subpage ? `/${locale}/organizations/${orgSlug}/${subpage}` : `/${locale}/organizations/${orgSlug}`; }
export function getPageUrl(locale: Locale, pageId: PageId, commonTranslations: CommonTranslations): string { return `/${locale}/${commonTranslations.pageRoutes[pageId]}`; }
const blogModules: Record<Locale, () => Promise<{ default: BlogTranslations }>> = { fr: () => import('./blog/fr'), en: () => import('./blog/en'), es: () => import('./blog/es'), ar: () => import('./blog/ar') };
export async function getBlogTranslations(locale: Locale): Promise<BlogTranslations> { try { return (await blogModules[locale]()).default; } catch (err) { if (locale !== DEFAULT_LOCALE) return (await blogModules[DEFAULT_LOCALE]()).default; throw err; } }
export function getBlogUrl(locale: Locale, blogT: BlogTranslations): string { return `/${locale}/${blogT.routes.blog}`; }
export function getBlogCategoryUrl(locale: Locale, blogT: BlogTranslations, slug: string): string { return `/${locale}/${blogT.routes.blog}/${slug}`; }
export function getBlogTagUrl(locale: Locale, blogT: BlogTranslations, slug: string): string { return `/${locale}/${blogT.routes.blog}/${blogT.routes.tags}/${slug}`; }
export function getBlogPostUrl(locale: Locale, blogT: BlogTranslations, slug: string, categorySlug?: string | null): string { return categorySlug ? `/${locale}/${blogT.routes.blog}/${categorySlug}/${slug}` : `/${locale}/${blogT.routes.blog}/${slug}`; }
export function resolvePageSlug(slug: string, commonTranslations: CommonTranslations): PageId | null { const match = (Object.entries(commonTranslations.pageRoutes) as [PageId, string][]).find(([, route]) => route === slug); return match?.[0] ?? null; }
export function toLocale(value: string | undefined): Locale { return value && LOCALES.includes(value as Locale) ? value as Locale : DEFAULT_LOCALE; }
export function isValidLocale(value: string | undefined): value is Locale { return typeof value === 'string' && (LOCALES as readonly string[]).includes(value); }
export function isRTL(locale: Locale): boolean { return RTL_LOCALES.includes(locale); }
export function getDirection(locale: Locale): 'rtl' | 'ltr' { return isRTL(locale) ? 'rtl' : 'ltr'; }