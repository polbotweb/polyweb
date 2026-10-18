import { and, asc, eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogPostLinks, blogPosts, blogPostSeo, blogPostTranslations } from "@database/schemas";
import type { Locale } from "@i18n/config";
import { getBlogPostForAdmin } from "./blog.loader";

export async function getBlogPostEditorData(postId: string, locale: Locale) {
  const base = await getBlogPostForAdmin(postId);
  if (!base) return null;

  const db = getDrizzle();
  const [seo] = await db
    .select()
    .from(blogPostSeo)
    .where(and(eq(blogPostSeo.postId, postId), eq(blogPostSeo.locale, locale)))
    .limit(1);

  const links = await db
    .select({
      id: blogPostLinks.id,
      linkType: blogPostLinks.linkType,
      sortOrder: blogPostLinks.sortOrder,
      targetId: blogPosts.id,
      targetSlug: blogPostTranslations.slug,
      targetTitle: blogPostTranslations.title,
    })
    .from(blogPostLinks)
    .innerJoin(blogPosts, eq(blogPostLinks.targetPostId, blogPosts.id))
    .leftJoin(
      blogPostTranslations,
      and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, locale)),
    )
    .where(eq(blogPostLinks.sourcePostId, postId))
    .orderBy(asc(blogPostLinks.sortOrder), asc(blogPostLinks.linkType));

  return {
    ...base,
    seo: seo ?? null,
    links: links.map((link) => ({
      id: link.id,
      linkType: link.linkType,
      sortOrder: link.sortOrder,
      target: {
        id: link.targetId,
        slug: link.targetSlug ?? "",
        title: link.targetTitle ?? null,
      },
    })),
  };
}
