import type { Locale } from "@i18n/config";
import arBlog from "@i18n/blog/ar";
import enBlog from "@i18n/blog/en";
import esBlog from "@i18n/blog/es";
import frBlog from "@i18n/blog/fr";
import { BLOG_OG_LOCALES, type BlogOgLocale } from "./constants";
import { stripHtml } from "@/core/content/text";
export { generateExcerpt, stripHtml } from "@/core/content/text";

const BLOG_ROUTE_SEGMENTS: Record<Locale, string> = {
  fr: frBlog.routes.blog,
  en: enBlog.routes.blog,
  es: esBlog.routes.blog,
  ar: arBlog.routes.blog,
};

export function buildBlogUrl(locale: Locale, organizationSlug: string | null, ...segments: (string | undefined)[]): string {
  const blogRoute = BLOG_ROUTE_SEGMENTS[locale];
  const base = organizationSlug ? `/${locale}/${organizationSlug}/${blogRoute}` : `/${locale}/${blogRoute}`;
  const path = segments.filter(Boolean).join("/");
  return path ? `${base}/${path}` : base;
}

export function buildBlogHref(baseUrl: string, ...segments: (string | null | undefined)[]): string {
  const path = segments.filter(Boolean).join("/");
  return path ? `${baseUrl}/${path}` : baseUrl;
}

export function extractOrgSlugFromBaseUrl(baseUrl: string): string | null {
  const match = baseUrl.match(/\/([^/]+)\/blog(?:\/|$)/);
  return match ? match[1] : null;
}

export function buildBlogPostUrl(locale: Locale, organizationSlug: string | null, slug: string, categorySlug?: string | null): string {
  return buildBlogUrl(locale, organizationSlug, categorySlug ?? undefined, slug);
}

export function buildBlogCategoryUrl(locale: Locale, organizationSlug: string | null, slug: string): string {
  return buildBlogUrl(locale, organizationSlug, slug);
}

export function buildBlogTagUrl(locale: Locale, organizationSlug: string | null, tagSegment: string, slug: string): string {
  return buildBlogUrl(locale, organizationSlug, tagSegment, slug);
}

export function buildBlogPostHref(baseUrl: string, slug: string, categorySlug?: string | null): string {
  return buildBlogHref(baseUrl, categorySlug ?? undefined, slug);
}

export function buildBlogCategoryHref(baseUrl: string, slug: string): string {
  return buildBlogHref(baseUrl, slug);
}

export function buildBlogTagHref(baseUrl: string, tagSegment: string, slug: string): string {
  return buildBlogHref(baseUrl, tagSegment, slug);
}

export function buildBlogAuthorUrl(locale: Locale, organizationSlug: string | null, username: string): string {
  const authorSegment = ({ fr: frBlog, en: enBlog, es: esBlog, ar: arBlog } as const)[locale].routes.author;
  return buildBlogUrl(locale, organizationSlug, authorSegment, username);
}

export function buildBlogAuthorHref(baseUrl: string, authorSegment: string, username: string): string {
  return buildBlogHref(baseUrl, authorSegment, username);
}

export function buildBlogAdminUrl(locale: Locale, organizationSlug: string | null, ...segments: (string | undefined)[]): string {
  const base = organizationSlug ? `/${locale}/${organizationSlug}/admin/blog` : `/${locale}/admin/blog`;
  const path = segments.filter(Boolean).join("/");
  return path ? `${base}/${path}` : base;
}

export function getOgLocale(locale: Locale): BlogOgLocale {
  return BLOG_OG_LOCALES[locale] ?? BLOG_OG_LOCALES.fr;
}

export function formatReadingTime(content: string, wordsPerMinute = 200): string {
  const wordCount = stripHtml(content).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(wordCount / wordsPerMinute));
  return `${minutes} min`;
}

export interface TocHeading { depth: 2 | 3; text: string; slug: string; }

export function extractHeadings(html: string): { html: string; headings: TocHeading[] } {
  const headings: TocHeading[] = [];
  const slugCounts = new Map<string, number>();
  const slugify = (text: string): string => {
    const base = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
    const occurrence = slugCounts.get(base) ?? 0;
    slugCounts.set(base, occurrence + 1);
    return occurrence === 0 ? base || "section" : `${base}-${occurrence}`;
  };
  const output = html.replace(/<h([23])((?:\s+[^>]*)?)>([\s\S]*?)<\/h\1>/gi, (match, level: string, attrs: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (!text) return match;
    const slug = slugify(text);
    headings.push({ depth: Number(level) as 2 | 3, text, slug });
    if (/\sid=/.test(attrs)) return match;
    return `<h${level}${attrs} id="${slug}">${inner}</h${level}>`;
  });
  return { html: output, headings };
}

export function generateSchemaMarkup(type: "BlogPosting" | "Blog" | "BreadcrumbList", data: Record<string, unknown>): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": type, ...data };
}

export function buildBreadcrumbSchema(_locale: Locale, items: { name: string; item?: string }[]): Record<string, unknown> {
  return generateSchemaMarkup("BreadcrumbList", { itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.item })) });
}

export function sanitizePagination(page: number, limit: number, maxLimit = 100): { page: number; limit: number } {
  return { page: Math.max(1, page), limit: Math.min(maxLimit, Math.max(1, limit)) };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
