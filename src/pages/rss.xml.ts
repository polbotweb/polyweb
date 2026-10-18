import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getPagesList } from "@database/loaders/page.loader";
import { getBlogPosts } from "@database/loaders/blog.loader";
import { LOCALES, DEFAULT_LOCALE, type Locale } from "@i18n/config";
import { getCommonTranslations } from "@i18n/utils";
import { buildBlogPostUrl } from "@/lib/blog/utils";

export const prerender = false;

/**
 * GET /rss.xml
 * RSS feed of all published CMS pages and global blog posts, across all locales.
 */
export const GET: APIRoute = async (context) => {
  const common = await getCommonTranslations(DEFAULT_LOCALE);

  const allItems: {
    title: string;
    link: string;
    pubDate?: Date;
    description?: string;
  }[] = [];

  for (const locale of LOCALES) {
    let localePages: { id: string; slug: string; title: string; publishedAt: Date | null }[] = [];
    try {
      localePages = await getPagesList(locale as Locale);
    } catch (err) {
      console.error(`[rss] Failed to load pages for locale "${locale}":`, err);
      continue;
    }

    for (const page of localePages) {
      allItems.push({
        title: `[${locale.toUpperCase()}] ${page.title}`,
        link: `/${locale}/${page.slug}`,
        pubDate: page.publishedAt ?? undefined,
      });
    }
  }

  // Global blog posts (org-scoped blogs are excluded — this is the sitewide feed)
  for (const locale of LOCALES) {
    try {
      let page = 1;
      for (;;) {
        const { items, meta } = await getBlogPosts(null, locale as Locale, {
          page,
          limit: 100,
          sortBy: "publishedAt",
          sortOrder: "desc",
        });
        for (const item of items) {
          if (!item.translation) continue;
          const categorySlug = item.categories[0]?.slug ?? null;
          allItems.push({
            title: `[${locale.toUpperCase()}] ${item.translation.title}`,
            link: buildBlogPostUrl(locale as Locale, null, item.translation.slug, categorySlug),
            pubDate: item.post.publishedAt ?? undefined,
            description: item.translation.excerpt ?? undefined,
          });
        }
        if (!meta.hasNextPage) break;
        page += 1;
      }
    } catch (err) {
      console.error(`[rss] Failed to load blog posts for locale "${locale}":`, err);
    }
  }

  return rss({
    title: common.rss.title,
    description: common.rss.description,
    site: context.site!,
    items: allItems,
    customData: `<language>${DEFAULT_LOCALE}</language>`,
  });
};
