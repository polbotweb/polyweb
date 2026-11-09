/**
 * Cibles de modération du blog (registre core `moderation/registry`, docs/moderation.md).
 * - `post` : signalement seulement (le statut éditorial n'est jamais modifié par la modération) ;
 * - `comment`, `review` : hide → REJECTED, spam → SPAM, restore → APPROVED.
 * La visibilité publique reste `blog_comments.status` / `blog_post_reviews.status`.
 */
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { blogComments, blogPostReviews, blogPosts, blogPostTranslations, organization } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { stripHtml } from "@/core/content/text";
import { dbTry } from "@/lib/effect/run";
import { publicBlogPostScope } from "@/lib/blog/public-visibility";
import { defineModuleModeration, type ModerationDecisionName, type ModerationExecutor, type ModerationTargetAdapter } from "@/core/moderation/registry";

const EXCERPT = 280;
const HIDDEN: Record<ModerationDecisionName, string> = { hide: "REJECTED", spam: "SPAM", restore: "APPROVED" };
const RESTORABLE = new Set(["REJECTED", "SPAM", "TRASH"]);

/** Nouveau statut, ou `null` si la décision ne s'applique pas (déjà masqué, rien à rétablir…). */
export function blogEngagementTransition(current: string, decision: ModerationDecisionName): string | null {
  if (decision === "restore") return RESTORABLE.has(current) ? HIDDEN.restore : null;
  return current === HIDDEN[decision] ? null : HIDDEN[decision];
}

const invalidateBlog = () => {
  for (const prefix of ["blog:post:", "blog:list:", "blog:related:"]) invalidateCache(prefix);
};

const postIsPublic = (executor: ModerationExecutor, postId: string) =>
  dbTry("moderation.blog.post.public", () =>
    executor.select({ id: blogPosts.id }).from(blogPosts).where(and(eq(blogPosts.id, postId), publicBlogPostScope(blogPosts))).limit(1),
  ).pipe(Effect.map((rows) => rows.length > 0));

const postLink = (executor: ModerationExecutor, postId: string, locale: string) =>
  dbTry("moderation.blog.post.link", () =>
    executor
      .select({ slug: blogPosts.slug, orgSlug: organization.slug, title: blogPostTranslations.title, localizedSlug: blogPostTranslations.slug })
      .from(blogPosts)
      .leftJoin(organization, eq(organization.id, blogPosts.organizationId))
      .leftJoin(blogPostTranslations, and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, locale as "fr")))
      .where(eq(blogPosts.id, postId))
      .limit(1),
  ).pipe(
    Effect.map(([row]) => (row ? { title: row.title ?? row.slug, url: `/${locale}${row.orgSlug ? `/${row.orgSlug}` : ""}/blog/${row.localizedSlug ?? row.slug}` } : null)),
  );

const clip = (html: string) => stripHtml(html).replace(/\s+/g, " ").trim().slice(0, EXCERPT);

const post: ModerationTargetAdapter = {
  type: "post",
  permission: { blog: ["moderate"] },
  reporters: "anyone",
  load: (executor, id) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("moderation.blog.post.load", () =>
        executor.select({ organizationId: blogPosts.organizationId, authorId: blogPosts.authorId, status: blogPosts.status }).from(blogPosts).where(eq(blogPosts.id, id)).limit(1),
      );
      if (!row) return null;
      return { organizationId: row.organizationId, siteId: null, authorId: row.authorId, status: row.status, publiclyVisible: yield* postIsPublic(executor, id) };
    }),
  excerpt: (executor, id, locale) => postLink(executor, id, locale).pipe(Effect.map((link) => (link ? { title: link.title, text: "", url: link.url } : null))),
};

const comment: ModerationTargetAdapter = {
  type: "comment",
  permission: { blogComment: ["moderate"] },
  reporters: "anyone",
  load: (executor, id) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("moderation.blog.comment.load", () =>
        executor
          .select({ postId: blogComments.postId, authorId: blogComments.authorId, status: blogComments.status, organizationId: blogPosts.organizationId })
          .from(blogComments)
          .innerJoin(blogPosts, eq(blogPosts.id, blogComments.postId))
          .where(eq(blogComments.id, id))
          .limit(1),
      );
      if (!row) return null;
      const visible = row.status === "APPROVED" && (yield* postIsPublic(executor, row.postId));
      return { organizationId: row.organizationId, siteId: null, authorId: row.authorId, status: row.status, publiclyVisible: visible };
    }),
  excerpt: (executor, id, locale) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("moderation.blog.comment.excerpt", () =>
        executor.select({ postId: blogComments.postId, content: blogComments.content }).from(blogComments).where(eq(blogComments.id, id)).limit(1),
      );
      if (!row) return null;
      const link = yield* postLink(executor, row.postId, locale);
      return { title: link?.title ?? null, text: clip(row.content), url: link?.url ?? null };
    }),
  apply: (tx, id, decision, current) =>
    Effect.gen(function* () {
      const next = blogEngagementTransition(current.status, decision);
      if (!next) return null;
      const updated = yield* dbTry("moderation.blog.comment.apply", () =>
        tx
          .update(blogComments)
          .set({ status: next as "APPROVED" })
          .where(and(eq(blogComments.id, id), eq(blogComments.status, current.status as "APPROVED")))
          .returning({ id: blogComments.id }),
      );
      return updated.length > 0 ? next : null;
    }),
  afterCommit: invalidateBlog,
};

const review: ModerationTargetAdapter = {
  type: "review",
  permission: { blogReview: ["moderate"] },
  reporters: "anyone",
  load: (executor, id) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("moderation.blog.review.load", () =>
        executor
          .select({ postId: blogPostReviews.postId, authorId: blogPostReviews.authorId, status: blogPostReviews.status, organizationId: blogPosts.organizationId })
          .from(blogPostReviews)
          .innerJoin(blogPosts, eq(blogPosts.id, blogPostReviews.postId))
          .where(eq(blogPostReviews.id, id))
          .limit(1),
      );
      if (!row) return null;
      const visible = row.status === "APPROVED" && (yield* postIsPublic(executor, row.postId));
      return { organizationId: row.organizationId, siteId: null, authorId: row.authorId, status: row.status, publiclyVisible: visible };
    }),
  excerpt: (executor, id, locale) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("moderation.blog.review.excerpt", () =>
        executor.select({ postId: blogPostReviews.postId, title: blogPostReviews.title, content: blogPostReviews.content }).from(blogPostReviews).where(eq(blogPostReviews.id, id)).limit(1),
      );
      if (!row) return null;
      const link = yield* postLink(executor, row.postId, locale);
      return { title: row.title ? clip(row.title) : link?.title ?? null, text: clip(row.content), url: link?.url ?? null };
    }),
  apply: (tx, id, decision, current) =>
    Effect.gen(function* () {
      const next = blogEngagementTransition(current.status, decision);
      if (!next || next === "TRASH") return null;
      const updated = yield* dbTry("moderation.blog.review.apply", () =>
        tx
          .update(blogPostReviews)
          .set({ status: next as "APPROVED" })
          .where(and(eq(blogPostReviews.id, id), eq(blogPostReviews.status, current.status as "APPROVED")))
          .returning({ id: blogPostReviews.id }),
      );
      return updated.length > 0 ? next : null;
    }),
  afterCommit: invalidateBlog,
};

export const blogModeration = defineModuleModeration("blog", [post, comment, review]);
