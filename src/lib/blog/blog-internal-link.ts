import type { Locale } from "@i18n/config";
import { getDrizzle } from "@database/drizzle";
import { eq, and, ilike } from "drizzle-orm";
import { blogPosts, blogPostTranslations } from "@database/schemas";
import { getBlogPostBySlug, getBlogValidLinkTargets } from "@database/loaders/blog.loader";
import { buildBlogPostUrl } from "@/lib/blog/utils";
import { orgScope, publishedScope } from "@database/loaders/blog.loader";
import type { InternalLinkResolver, InternalLinkResolution } from "@/lib/content/internal-link-resolver";

interface Ctx {
  locale: string;
  organizationId?: string | null;
  limit?: number;
}

/**
 * Blog internal-link resolver. Registered into the shared content registry so
 * the generic ContentEditor / RichContent can resolve & validate blog links
 * without being coupled to the blog module.
 */
export const blogInternalLinkResolver: InternalLinkResolver = {
  name: "blog",

  async resolve(target: string, ctx: Ctx): Promise<InternalLinkResolution> {
    const locale = ctx.locale as Locale;
    const orgId = ctx.organizationId ?? null;
    const post = await getBlogPostBySlug(orgId, locale, target);
    if (!post || !post.translation) {
      return { href: "#", title: null, exists: false };
    }
    const categorySlug = post.categories[0]?.slug ?? null;
    const href = buildBlogPostUrl(locale, orgId, post.translation.slug, categorySlug);
    return { href, title: post.translation.title, exists: true };
  },

  async listValidTargets(ctx: Ctx): Promise<Set<string>> {
    return getBlogValidLinkTargets(ctx.organizationId ?? null, ctx.locale as Locale);
  },

  async search(query: string, ctx: Ctx) {
    const db = getDrizzle();
    const orgId = ctx.organizationId ?? null;
    const locale = ctx.locale as Locale;
    const limit = Math.min(20, Math.max(1, ctx.limit ?? 10));
    const q = `%${query}%`;
    const rows = await db
      .select({
        id: blogPosts.id,
        slug: blogPostTranslations.slug,
        title: blogPostTranslations.title,
      })
      .from(blogPostTranslations)
      .innerJoin(blogPosts, eq(blogPosts.id, blogPostTranslations.postId))
      .where(
        and(
          eq(blogPostTranslations.locale, locale),
          orgScope(blogPosts, orgId),
          publishedScope(blogPosts),
          ilike(blogPostTranslations.title, q),
        ),
      )
      .limit(limit);

    return rows.map((r) => {
      const categorySlug = null; // search results don't carry category; resolve() is used for exact href
      const href = buildBlogPostUrl(locale, orgId, r.slug, categorySlug);
      return { id: r.id, label: r.title, href };
    });
  },
};
