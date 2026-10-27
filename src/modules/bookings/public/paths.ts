/** Chemins du parcours public (purs, utilisables côté pages et tests). */
import type { Locale } from "@i18n/config";

/** Tenant public : `organizationId` null = plateforme. */
export interface PublicTenant {
  readonly organizationId: string | null;
  readonly slug: string | null;
  readonly name: string | null;
}
export const PLATFORM_TENANT: PublicTenant = { organizationId: null, slug: null, name: null };

export const publicBasePath = (locale: Locale, tenant: PublicTenant) => (tenant.slug ? `/${locale}/${tenant.slug}/bookings` : `/${locale}/bookings`);
export const manageUrlPath = (locale: Locale, tenant: PublicTenant, id: string, token: string) =>
  `${publicBasePath(locale, tenant)}/manage/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`;
