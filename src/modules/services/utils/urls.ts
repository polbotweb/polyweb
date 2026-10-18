import type { Locale } from "@i18n/config";

export function buildServiceUrl(locale: Locale, organizationSlug: string | null, slug: string, categorySlug?: string | null): string {
  const base = organizationSlug ? `/${locale}/${organizationSlug}/services` : `/${locale}/services`;
  return categorySlug ? `${base}/category/${categorySlug}/${slug}` : `${base}/${slug}`;
}

export function buildServiceCategoryUrl(locale: Locale, organizationSlug: string | null, slug: string): string {
  const base = organizationSlug ? `/${locale}/${organizationSlug}/services` : `/${locale}/services`;
  return `${base}/category/${slug}`;
}
