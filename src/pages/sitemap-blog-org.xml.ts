import type { APIRoute } from "astro";
import { getDrizzle } from "@database/drizzle";
import { organization } from "@database/schemas";
import { getBlogPosts, getBlogCategories, getBlogTags } from "@database/loaders/blog.loader";
import { LOCALES, type Locale } from "@i18n/config";
import { getBlogTranslations } from "@i18n/utils";
import { buildBlogCategoryUrl, buildBlogPostUrl, buildBlogTagUrl } from "@/lib/blog/utils";

export const prerender = false;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function urlEntry(baseUrl: string, path: string, lastmod?: Date | null): string {
  const loc = `    <loc>${escapeXml(baseUrl)}${escapeXml(path)}</loc>`;
  const mod = lastmod ? `\n    <lastmod>${lastmod.toISOString()}</lastmod>` : "";
  return `  <url>\n${loc}${mod}\n  </url>`;
}

/**
 * GET /sitemap-blog-org.xml
 * Sitemap for all organization-scoped blogs (posts, categories, tags) across locales.
 */
export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site?.origin ?? "http://localhost:4321";
  const urls: string[] = [];

  const db = getDrizzle();
  const orgs = await db
    .select({ id: organization.id, slug: organization.slug, name: organization.name })
    .from(organization);

  for (const org of orgs) {
    for (const locale of LOCALES) {
      try {
        const blogT = await getBlogTranslations(locale as Locale);
        const baseBlog = `/${locale}/${org.slug}/${blogT.routes.blog}`;
        urls.push(urlEntry(baseUrl, baseBlog));

        const categories = await getBlogCategories(org.id, locale as Locale);
        for (const category of categories) {
          urls.push(urlEntry(baseUrl, buildBlogCategoryUrl(locale as Locale, org.slug, category.slug)));
        }

        const tags = await getBlogTags(org.id, locale as Locale);
        for (const tag of tags) {
          urls.push(urlEntry(baseUrl, buildBlogTagUrl(locale as Locale, org.slug, blogT.routes.tags, tag.slug)));
        }

        let page = 1;
        for (;;) {
          const { items, meta } = await getBlogPosts(org.id, locale as Locale, {
            page,
            limit: 100,
            sortBy: "publishedAt",
            sortOrder: "desc",
          });
          for (const item of items) {
            if (!item.translation) continue;
            const categorySlug = item.categories[0]?.slug ?? null;
            urls.push(
              urlEntry(
                baseUrl,
                buildBlogPostUrl(locale as Locale, org.slug, item.translation.slug, categorySlug),
                item.post.publishedAt,
              ),
            );
          }
          if (!meta.hasNextPage) break;
          page += 1;
        }
      } catch (err) {
        console.error(`[sitemap:org] Failed for org "${org.slug}" locale "${locale}":`, err);
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
};
