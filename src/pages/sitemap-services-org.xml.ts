import type { APIRoute } from "astro";
import { getDrizzle } from "@database/drizzle";
import { organization } from "@database/schemas";
import { getServices, getServiceCategories, getServiceTags } from "@/modules/services/loaders";
import { LOCALES, type Locale } from "@i18n/config";
import { buildServiceUrl } from "@/modules/services/utils";

export const prerender = false;
function escapeXml(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function urlEntry(baseUrl: string, path: string, lastmod?: Date | null): string { const loc = `    <loc>${escapeXml(baseUrl)}${escapeXml(path)}</loc>`; const mod = lastmod ? `\n    <lastmod>${lastmod.toISOString()}</lastmod>` : ""; return `  <url>\n${loc}${mod}\n  </url>`; }

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site?.origin ?? "http://localhost:4321";
  const urls: string[] = [];
  const db = getDrizzle();
  const orgs = await db.select({ id: organization.id, slug: organization.slug }).from(organization);
  for (const org of orgs) {
    for (const locale of LOCALES) {
      try {
        const base = `/${locale}/${org.slug}/services`;
        urls.push(urlEntry(baseUrl, base));
        const categories = await getServiceCategories(locale as Locale, org.id); for (const category of categories) urls.push(urlEntry(baseUrl, `${base}/${category.translation?.slug ?? category.category.slug}`));
        const tags = await getServiceTags(locale as Locale, org.id); for (const tag of tags) urls.push(urlEntry(baseUrl, `${base}/tags/${tag.translation?.slug ?? tag.tag.slug}`));
        let page = 1; for (;;) { const data = await getServices({ organizationId: org.id, page, limit: 100, sortBy: "publishedAt", sortOrder: "desc" }, locale as Locale, true); for (const item of data.items) urls.push(urlEntry(baseUrl, buildServiceUrl(locale as Locale, org.slug, item.translation?.slug ?? item.service.slug, item.categories[0]?.slug ?? null), item.service.publishedAt)); if (page >= data.totalPages) break; page += 1; }
      } catch (err) { console.error(`[sitemap:services:org] Failed for org "${org.slug}" locale "${locale}":`, err); }
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
};
