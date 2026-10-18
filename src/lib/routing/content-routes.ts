import type { Locale } from "@i18n/config";

export interface ContentRouteContext {
  locale: Locale;
  organizationSlug?: string | null;
}

function contentBase({ locale, organizationSlug }: ContentRouteContext, section: "blog" | "services"): string {
  return organizationSlug
    ? `/${locale}/${organizationSlug}/${section}`
    : `/${locale}/${section}`;
}

export function buildBlogIndexUrl(context: ContentRouteContext): string {
  return contentBase(context, "blog");
}

export function buildBlogCategoryUrl(context: ContentRouteContext & { categorySlug: string }): string {
  return `${contentBase(context, "blog")}/${context.categorySlug}`;
}

export function buildBlogPostUrl(context: ContentRouteContext & { categorySlug: string; postSlug: string }): string {
  return `${buildBlogCategoryUrl(context)}/${context.postSlug}`;
}

export function buildBlogTagUrl(context: ContentRouteContext & { tagSlug: string }): string {
  return `${contentBase(context, "blog")}/tag/${context.tagSlug}`;
}

export function buildBlogAuthorUrl(context: ContentRouteContext & { username: string }): string {
  return `${contentBase(context, "blog")}/author/${context.username}`;
}

export function buildServicesIndexUrl(context: ContentRouteContext): string {
  return contentBase(context, "services");
}

export function buildServicesCategoryUrl(context: ContentRouteContext & { categorySlug: string }): string {
  return `${contentBase(context, "services")}/category/${context.categorySlug}`;
}

export function buildServiceUrl(context: ContentRouteContext & { serviceSlug: string; categorySlug?: string | null }): string {
  return context.categorySlug
    ? `${buildServicesCategoryUrl({ ...context, categorySlug: context.categorySlug })}/${context.serviceSlug}`
    : `${contentBase(context, "services")}/${context.serviceSlug}`;
}

export function buildServicesTagUrl(context: ContentRouteContext & { tagSlug: string }): string {
  return `${contentBase(context, "services")}/tag/${context.tagSlug}`;
}
