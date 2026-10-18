import { eq, and, asc, or, lte, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { cached } from "@database/cache";
import { pages, pageSections } from "@database/schemas";
import { isValidLocale } from "@i18n/utils";

export interface PageWithSections {
  page: typeof pages.$inferSelect;
  sections: (typeof pageSections.$inferSelect)[];
}

/**
 * Load a published CMS page by locale and slug, including its visible sections.
 */
export const getPage = cached(
  (locale: string, slug: string) => `page:${locale}:${slug}`,
  async (
    locale: string,
    slug: string,
  ): Promise<PageWithSections | null> => {
  if (!isValidLocale(locale)) return null;
  const db = getDrizzle();
  const now = new Date();

  const [page] = await db
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.locale, locale),
        eq(pages.slug, slug),
        isNull(pages.deletedAt),
        or(
          eq(pages.isPublished, true),
          lte(pages.scheduledAt, now),
        ),
      ),
    )
    .limit(1);

  if (!page) return null;

  // Lazy-update: if the page was served via scheduled publishing, persist the
  // published state so the admin UI stays consistent.
  if (!page.isPublished && page.scheduledAt && page.scheduledAt <= now) {
    try {
      await db
        .update(pages)
        .set({ isPublished: true, publishedAt: page.scheduledAt, scheduledAt: null })
        .where(eq(pages.id, page.id));
    } catch (err: unknown) {
      console.error('[page.loader] Lazy-update for scheduled publish failed:', err);
    }
  }

  const sections = await db
    .select()
    .from(pageSections)
    .where(
      and(
        eq(pageSections.pageId, page.id),
        eq(pageSections.isVisible, true),
      ),
    )
    .orderBy(asc(pageSections.sortOrder))
    .limit(200);

  return { page, sections };
  },
);

/**
 * List all published CMS pages for a locale (for sitemap, nav, etc.).
 */
export const getPagesList = cached(
  (locale: string) => `page:list:${locale}`,
  async (locale: string) => {
    if (!isValidLocale(locale)) return [];
    const db = getDrizzle();
    const now = new Date();
    return db
      .select({
        id: pages.id,
        slug: pages.slug,
        title: pages.title,
        sortOrder: pages.sortOrder,
        publishedAt: pages.publishedAt,
      })
      .from(pages)
      .where(
        and(
          eq(pages.locale, locale),
          isNull(pages.deletedAt),
          or(
            eq(pages.isPublished, true),
            lte(pages.scheduledAt, now),
          ),
        ),
      )
      .orderBy(asc(pages.sortOrder))
      .limit(500);
  },
);

/**
 * Load a CMS page by ID (draft or published) for admin preview.
 * NOT cached — always returns fresh data.
 */
export async function getPagePreview(pageId: string): Promise<PageWithSections | null> {
  const db = getDrizzle();

  const [page] = await db
    .select()
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);

  if (!page) return null;

  const sections = await db
    .select()
    .from(pageSections)
    .where(eq(pageSections.pageId, page.id))
    .orderBy(asc(pageSections.sortOrder))
    .limit(200);

  return { page, sections };
}
