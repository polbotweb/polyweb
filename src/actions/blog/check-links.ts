import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogPosts, blogPostTranslations, blogPostLinks } from "@database/schemas";
import type { Locale } from "@i18n/config";
import {
  assertBlogPermission,
  assertPostInTenant,
  resolveBlogTenant,
  blogRateLimit,
  auditBlog,
  blogOrganizationIdSchema,
} from "./_helpers";
import { detectDeadInternalLinks } from "@/lib/content/editor-helpers";
import { blogInternalLinkResolver } from "@/lib/blog/blog-internal-link";
import { publicBlogPostScope } from "@/lib/blog/public-visibility";

/**
 * Admin action: scans a post for dead internal links.
 *  - explicit `blogPostLinks` whose target post no longer exists,
 *  - inline `<a data-internal-link="slug">` inside the post content whose slug
 *    is no longer published.
 * Returns a structured report the admin UI can render with warnings + removal.
 */
export const checkBlogPostLinks = defineAction({
  input: z.object({
    postId: z.uuid(),
    locale: z.string().min(2).max(5),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: async (input, context) => {
    const tenant = resolveBlogTenant(input);
    const user = await assertBlogPermission(context, tenant, { blog: ["update"] });
    blogRateLimit(context, user.id, "link-check");
    await assertPostInTenant(input.postId, tenant);

    const db = getDrizzle();
    const locale = input.locale as Locale;
    const postTenantCondition = tenant.organizationId === null
      ? isNull(blogPosts.organizationId)
      : eq(blogPosts.organizationId, tenant.organizationId);

    // 1. Explicit blogPostLinks whose target is gone.
    const explicitLinks = await db
      .select({
        id: blogPostLinks.id,
        linkType: blogPostLinks.linkType,
        targetPostId: blogPostLinks.targetPostId,
      })
      .from(blogPostLinks)
      .where(eq(blogPostLinks.sourcePostId, input.postId));

    const deadExplicit: { id: string; linkType: string; targetPostId: string }[] = [];
    for (const link of explicitLinks) {
      if (link.targetPostId === input.postId) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Un article ne peut pas contenir un lien explicite vers lui-même.",
        });
      }
      const [target] = await db
        .select({ id: blogPosts.id, organizationId: blogPosts.organizationId })
        .from(blogPosts)
        .where(eq(blogPosts.id, link.targetPostId))
        .limit(1);
      if (target && (target.organizationId ?? null) !== tenant.organizationId) {
        deadExplicit.push(link);
        continue;
      }

      const [publicTarget] = target
        ? await db
            .select({ id: blogPosts.id })
            .from(blogPosts)
            .where(
              and(
                eq(blogPosts.id, link.targetPostId),
                postTenantCondition,
                publicBlogPostScope(blogPosts),
              ),
            )
            .limit(1)
        : [];
      if (!publicTarget) {
        deadExplicit.push(link);
      }
    }

    // 2. Inline links inside the content HTML.
    const translationTenantCondition = tenant.organizationId === null
      ? isNull(blogPostTranslations.organizationId)
      : eq(blogPostTranslations.organizationId, tenant.organizationId);
    const [translation] = await db
      .select({ content: blogPostTranslations.content, slug: blogPostTranslations.slug })
      .from(blogPostTranslations)
      .where(
        and(
          eq(blogPostTranslations.postId, input.postId),
          eq(blogPostTranslations.locale, locale),
          translationTenantCondition,
        ),
      )
      .limit(1);

    const validTargets = new Set(
      await blogInternalLinkResolver.listValidTargets({
        locale,
        organizationId: tenant.organizationId,
      }),
    );
    if (translation) validTargets.delete(translation.slug);

    const deadInline = translation ? detectDeadInternalLinks(translation.content, validTargets) : [];

    auditBlog(context, user.id, "BLOG_LINK_CHECK", {
      resource: "blog_posts",
      resourceId: input.postId,
      metadata: { deadExplicit: deadExplicit.length, deadInline: deadInline.length },
    });

    return {
      deadExplicit: deadExplicit.map((l) => ({ id: l.id, linkType: l.linkType, targetPostId: l.targetPostId })),
      deadInline: deadInline.map((d) => ({ href: d.href, text: d.text, target: d.target, reason: d.reason })),
    };
  },
});
