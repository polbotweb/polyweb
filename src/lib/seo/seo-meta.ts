/**
 * Helpers SEO purs (repris et généralisés depuis les-rochers-blancs SEOHead/JsonLd).
 * Complètent les balises de base émises par BaseLayout (title/canonical/og/twitter) :
 * balises article:*, og:locale:alternate, robots, dimensions og:image,
 * et constructeurs JSON-LD typés (Organization, WebSite, Article, BreadcrumbList).
 */
import { LOCALES, type Locale } from "@i18n/config";

export const OG_LOCALE_MAP: Record<string, string> = {
  fr: "fr_FR",
  en: "en_US",
  es: "es_ES",
  ar: "ar_AR",
  de: "de_DE",
  it: "it_IT",
  pt: "pt_PT",
  zh: "zh_CN",
};

export interface SeoExtraInput {
  locale: Locale;
  ogType?: "website" | "article";
  noindex?: boolean;
  publishedTime?: string | Date | null;
  modifiedTime?: string | Date | null;
  author?: string | null;
  section?: string | null;
  tags?: string[];
  ogImageWidth?: number;
  ogImageHeight?: number;
}

export type MetaTag = { property?: string; name?: string; content: string };

const iso = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString() : undefined);

export function buildSeoExtraMeta(input: SeoExtraInput): MetaTag[] {
  const tags: MetaTag[] = [];
  for (const l of LOCALES) {
    if (l !== input.locale) tags.push({ property: "og:locale:alternate", content: OG_LOCALE_MAP[l] ?? l });
  }
  if (input.ogImageWidth) tags.push({ property: "og:image:width", content: String(input.ogImageWidth) });
  if (input.ogImageHeight) tags.push({ property: "og:image:height", content: String(input.ogImageHeight) });
  if (input.ogType === "article") {
    const pub = iso(input.publishedTime);
    const mod = iso(input.modifiedTime);
    if (pub) tags.push({ property: "article:published_time", content: pub });
    if (mod) tags.push({ property: "article:modified_time", content: mod });
    if (input.author) tags.push({ property: "article:author", content: input.author });
    if (input.section) tags.push({ property: "article:section", content: input.section });
    for (const t of input.tags ?? []) tags.push({ property: "article:tag", content: t });
  }
  if (input.noindex) tags.push({ name: "robots", content: "noindex, nofollow" });
  return tags;
}

export function absoluteUrl(siteUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteUrl.replace(/\/$/, "")}/${pathOrUrl.replace(/^\//, "")}`;
}

type JsonLd = Record<string, unknown>;

export function organizationJsonLd(o: { name: string; url: string; logo?: string; sameAs?: string[] }): JsonLd {
  return { "@context": "https://schema.org", "@type": "Organization", name: o.name, url: o.url, ...(o.logo ? { logo: o.logo } : {}), ...(o.sameAs?.length ? { sameAs: o.sameAs } : {}) };
}

export function websiteJsonLd(o: { name: string; url: string; locale: string; searchUrlTemplate?: string }): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: o.name,
    url: o.url,
    inLanguage: o.locale,
    ...(o.searchUrlTemplate
      ? { potentialAction: { "@type": "SearchAction", target: o.searchUrlTemplate, "query-input": "required name=search_term_string" } }
      : {}),
  };
}

export function articleJsonLd(o: {
  headline: string; url: string; locale: string; description?: string; image?: string;
  datePublished?: string | Date | null; dateModified?: string | Date | null; authorName?: string | null; publisherName?: string;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: o.headline.slice(0, 110),
    url: o.url,
    mainEntityOfPage: o.url,
    inLanguage: o.locale,
    ...(o.description ? { description: o.description } : {}),
    ...(o.image ? { image: [o.image] } : {}),
    ...(iso(o.datePublished) ? { datePublished: iso(o.datePublished) } : {}),
    ...(iso(o.dateModified ?? o.datePublished) ? { dateModified: iso(o.dateModified ?? o.datePublished) } : {}),
    ...(o.authorName ? { author: { "@type": "Person", name: o.authorName } } : {}),
    ...(o.publisherName ? { publisher: { "@type": "Organization", name: o.publisherName } } : {}),
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}
