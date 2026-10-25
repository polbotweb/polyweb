import { Effect } from "effect";
import { blogPostLock } from "@/modules/blog/locks";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, desc, isNull, ne } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import {
  blogPosts,
  blogPostTranslations,
  blogPostCategories,
  blogPostTags,
  blogPostRevisions,
  blogPostSeo,
} from "@database/schemas";
import { sanitizeHtml } from "@/lib/sanitize";
import { LOCALES } from "@i18n/config";
import { blogPostFormSchema, blogPostUpdateSchema, calculateSeoScore } from "@/lib/blog/validation";
import { generateExcerpt, getOgLocale } from "@/lib/blog/utils";
import {
  resolveBlogTenant,
  categoryInTenant,
  tagInTenant,
  mediaInTenant,
  auditBlog,
  invalidateBlogCache,
  blogOrganizationIdSchema,
  blogRateLimitEffect,
  postInTenant,
  requireBlogPermission,
} from "./_helpers";
import { actionTry, effectHandler } from "@/lib/effect/action";

export const createBlogPost = defineAction({
  input: blogPostFormSchema.extend({ organizationId: blogOrganizationIdSchema }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, {
      blog: input.status === "PUBLISHED" ? ["create", "publish"] : ["create"],
    });
    yield* blogRateLimitEffect(user.id, "post-create");
    yield* Effect.all([
      ...(input.categoryIds ?? []).map((categoryId) => categoryInTenant(categoryId, tenant)),
      ...(input.tagIds ?? []).map((tagId) => tagInTenant(tagId, tenant)),
      ...(input.featuredImageId ? [mediaInTenant(input.featuredImageId, tenant)] : []),
      ...(input.ogImageId ? [mediaInTenant(input.ogImageId, tenant)] : []),
    ], { concurrency: "unbounded", discard: true });
    return yield* actionTry("blog/post.createBlogPost", async () => {

    const db = getDrizzle();

    const now = new Date();
    const publishedAt = input.status === "PUBLISHED" ? (input.publishedAt ?? now) : null;
    const content = sanitizeHtml(input.content);
    const excerpt = input.excerpt?.trim() || generateExcerpt(content);
    const seoScore = calculateSeoScore({
      title: input.title,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      content,
      focusKeyword: input.seo?.focusKeyword,
    });

    let post: typeof blogPosts.$inferSelect;
    try {
      post = await db.transaction(async (tx) => {
        const [createdPost] = await tx.insert(blogPosts).values({
          organizationId: tenant.organizationId,
          authorId: user.id,
          slug: input.slug,
          status: input.status,
          featuredImageId: input.featuredImageId,
          isFeatured: input.isFeatured ?? false,
          isSticky: input.isSticky ?? false,
          commentStatus: input.commentStatus ?? "OPEN",
          allowReviews: input.allowReviews ?? true,
          seoScore,
          publishedAt,
          updatedBy: user.id,
        }).returning();

        await tx.insert(blogPostTranslations).values({
          postId: createdPost.id,
          organizationId: tenant.organizationId,
          locale: input.locale,
          title: input.title,
          slug: input.slug,
          content,
          excerpt,
          metaTitle: input.metaTitle,
          metaDescription: input.metaDescription,
          metaKeywords: input.metaKeywords,
          canonicalUrl: input.canonicalUrl,
          ogTitle: input.ogTitle,
          ogDescription: input.ogDescription,
          ogImageId: input.ogImageId,
        });

        if (input.categoryIds?.length) {
          await tx.insert(blogPostCategories).values(input.categoryIds.map((categoryId) => ({ postId: createdPost.id, categoryId })));
        }
        if (input.tagIds?.length) {
          await tx.insert(blogPostTags).values(input.tagIds.map((tagId) => ({ postId: createdPost.id, tagId })));
        }
        if (input.seo) {
          await tx.insert(blogPostSeo).values({
            postId: createdPost.id,
            locale: input.locale,
            focusKeyword: input.seo.focusKeyword,
            focusKeywordScore: seoScore,
            metaRobots: input.seo.metaRobots,
            metaOgType: input.seo.metaOgType,
            metaOgLocale: getOgLocale(input.locale),
            metaTwitterCard: input.seo.metaTwitterCard,
            schemaMarkup: input.seo.schemaMarkup,
          });
        }
        await tx.insert(blogPostRevisions).values({
          postId: createdPost.id,
          authorId: user.id,
          locale: input.locale,
          title: input.title,
          slug: input.slug,
          content,
          excerpt,
          status: input.status === "PUBLISHED" ? "PUBLISHED" : input.status === "ARCHIVED" ? "ARCHIVED" : "DRAFT",
          revisionNote: "Création initiale",
        });
        return createdPost;
      });
    } catch (err) {
      if (err instanceof Error && /duplicate|unique/i.test(err.message)) {
        throw new ActionError({ code: "CONFLICT", message: "Un article avec ce slug existe déjà pour ce tenant/locale." });
      }
      throw err;
    }

    auditBlog(context, user.id, "BLOG_POST_CREATE", {
      resource: "blog_posts",
      resourceId: post.id,
      metadata: { organizationId: tenant.organizationId, locale: input.locale, slug: input.slug },
    });
    invalidateBlogCache();
    return { id: post.id, slug: input.slug };
  }); })),
});

export const updateBlogPost = defineAction({
  input: blogPostUpdateSchema.safeExtend({
    organizationId: blogOrganizationIdSchema,
    categoryIds: z.array(z.uuid()).max(10).optional(),
    tagIds: z.array(z.uuid()).max(20).optional(),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blog: ["update"] });
    yield* blogRateLimitEffect(user.id, "post-update");
    const { id, organizationId: _, categoryIds, tagIds, seo, status: _status, publishedAt: _publishedAt, ...data } = input;
    const existingPost = yield* postInTenant(id, tenant);
    yield* Effect.all([
      ...(categoryIds ?? []).map((categoryId) => categoryInTenant(categoryId, tenant)),
      ...(tagIds ?? []).map((tagId) => tagInTenant(tagId, tenant)),
      ...(data.featuredImageId ? [mediaInTenant(data.featuredImageId, tenant)] : []),
      ...(data.ogImageId ? [mediaInTenant(data.ogImageId, tenant)] : []),
    ], { concurrency: "unbounded", discard: true });
    // Verrou générique (src/core/locks) : propriétaire = utilisateur + session.
    yield* blogPostLock.ensureNotLockedByOther(id, lockOwnerFrom(user.id, context.locals.session?.id), lockLocaleFrom(context.request.headers));
    return yield* actionTry("blog/post.updateBlogPost", async () => {
    const db = getDrizzle();

    const locale = input.locale;
    const existingTranslation = locale
      ? await db.select().from(blogPostTranslations).where(and(eq(blogPostTranslations.postId, id), eq(blogPostTranslations.locale, locale))).limit(1).then((rows) => rows[0])
      : null;

    if (existingTranslation && (existingTranslation.organizationId ?? null) !== tenant.organizationId) {
      throw new ActionError({ code: "FORBIDDEN", message: "Cette traduction n'appartient pas au même tenant que son article." });
    }

    const isCanonicalLocale = locale === LOCALES[0];
    if (data.slug) {
      if (isCanonicalLocale) {
        const orgCond = tenant.organizationId === null ? isNull(blogPosts.organizationId) : eq(blogPosts.organizationId, tenant.organizationId);
        const [dupPost] = await db.select({ id: blogPosts.id }).from(blogPosts).where(and(eq(blogPosts.slug, data.slug), orgCond, ne(blogPosts.id, id))).limit(1);
        if (dupPost) throw new ActionError({ code: "CONFLICT", message: "Un article avec ce slug existe déjà pour ce tenant." });
      }
      if (locale) {
        const transOrgCond = tenant.organizationId === null ? isNull(blogPostTranslations.organizationId) : eq(blogPostTranslations.organizationId, tenant.organizationId);
        const translationConditions = [
          eq(blogPostTranslations.slug, data.slug),
          eq(blogPostTranslations.locale, locale),
          transOrgCond,
          ...(existingTranslation ? [ne(blogPostTranslations.id, existingTranslation.id)] : []),
        ];
        const [dupTrans] = await db.select({ id: blogPostTranslations.id }).from(blogPostTranslations).where(and(...translationConditions)).limit(1);
        if (dupTrans) throw new ActionError({ code: "CONFLICT", message: "Une traduction avec ce slug existe déjà pour cette locale/tenant." });
      }
    }

    const content = data.content ? sanitizeHtml(data.content) : undefined;
    const excerpt = data.excerpt?.trim() || (content ? generateExcerpt(content) : undefined);
    const seoScore = calculateSeoScore({
      title: data.title ?? existingTranslation?.title ?? "",
      metaTitle: data.metaTitle ?? existingTranslation?.metaTitle ?? undefined,
      metaDescription: data.metaDescription ?? existingTranslation?.metaDescription ?? undefined,
      content: content ?? existingTranslation?.content ?? "",
      focusKeyword: seo?.focusKeyword,
    });

    if (locale && !existingTranslation && (!data.title || !data.slug || !content)) {
      throw new ActionError({ code: "BAD_REQUEST", message: "Le titre, le slug et le contenu sont requis pour une nouvelle traduction." });
    }

    try {
      await db.transaction(async (tx) => {
        await tx.update(blogPosts).set({
          ...(isCanonicalLocale && data.slug !== undefined ? { slug: data.slug } : {}),
          featuredImageId: data.featuredImageId,
          isFeatured: data.isFeatured,
          isSticky: data.isSticky,
          commentStatus: data.commentStatus,
          allowReviews: data.allowReviews,
          seoScore,
          updatedBy: user.id,
        }).where(eq(blogPosts.id, id));

        if (locale) {
          if (existingTranslation) {
            await tx.update(blogPostTranslations).set({
              title: data.title,
              slug: data.slug,
              content,
              excerpt,
              metaTitle: data.metaTitle,
              metaDescription: data.metaDescription,
              metaKeywords: data.metaKeywords,
              canonicalUrl: data.canonicalUrl,
              ogTitle: data.ogTitle,
              ogDescription: data.ogDescription,
              ogImageId: data.ogImageId,
            }).where(eq(blogPostTranslations.id, existingTranslation.id));
          } else {
            await tx.insert(blogPostTranslations).values({
              postId: id,
              organizationId: tenant.organizationId,
              locale,
              title: data.title!,
              slug: data.slug!,
              content: content!,
              excerpt,
              metaTitle: data.metaTitle,
              metaDescription: data.metaDescription,
              metaKeywords: data.metaKeywords,
              canonicalUrl: data.canonicalUrl,
              ogTitle: data.ogTitle,
              ogDescription: data.ogDescription,
              ogImageId: data.ogImageId,
            });
          }
        }

        if (categoryIds !== undefined) {
          await tx.delete(blogPostCategories).where(eq(blogPostCategories.postId, id));
          if (categoryIds.length) await tx.insert(blogPostCategories).values(categoryIds.map((categoryId) => ({ postId: id, categoryId })));
        }
        if (tagIds !== undefined) {
          await tx.delete(blogPostTags).where(eq(blogPostTags.postId, id));
          if (tagIds.length) await tx.insert(blogPostTags).values(tagIds.map((tagId) => ({ postId: id, tagId })));
        }

        if (seo && locale) {
          const [existingSeo] = await tx.select().from(blogPostSeo).where(and(eq(blogPostSeo.postId, id), eq(blogPostSeo.locale, locale))).limit(1);
          const seoValues = {
            focusKeyword: seo.focusKeyword,
            focusKeywordScore: seoScore,
            metaRobots: seo.metaRobots,
            metaOgType: seo.metaOgType,
            metaOgLocale: getOgLocale(locale),
            metaTwitterCard: seo.metaTwitterCard,
            schemaMarkup: seo.schemaMarkup,
          };
          if (existingSeo) await tx.update(blogPostSeo).set(seoValues).where(eq(blogPostSeo.id, existingSeo.id));
          else await tx.insert(blogPostSeo).values({ postId: id, locale, ...seoValues });
        }

        const revisionTranslation = existingTranslation ?? {
          locale: locale ?? LOCALES[0],
          title: data.title ?? "",
          slug: data.slug ?? "",
          content: content ?? "",
          excerpt,
        };
        await tx.insert(blogPostRevisions).values({
          postId: id,
          authorId: user.id,
          locale: revisionTranslation.locale,
          title: data.title ?? revisionTranslation.title,
          slug: data.slug ?? revisionTranslation.slug,
          content: content ?? revisionTranslation.content,
          excerpt: excerpt ?? revisionTranslation.excerpt,
          status: existingPost.status === "PUBLISHED" ? "PUBLISHED" : existingPost.status === "ARCHIVED" ? "ARCHIVED" : "DRAFT",
          revisionNote: "Mise à jour",
        });
      });
    } catch (err) {
      if (err instanceof Error && /duplicate|unique/i.test(err.message)) {
        throw new ActionError({ code: "CONFLICT", message: "Un article avec ce slug existe déjà pour ce tenant/locale." });
      }
      throw err;
    }

    auditBlog(context, user.id, "BLOG_POST_UPDATE", {
      resource: "blog_posts",
      resourceId: id,
      metadata: { organizationId: tenant.organizationId },
    });
    invalidateBlogCache();
    return { id };
  }); })),
});

export const lockBlogPost = defineAction({
  input: z.object({ id: z.uuid(), organizationId: blogOrganizationIdSchema, takeOver: z.boolean().optional() }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blog: ["update"] });
    yield* postInTenant(input.id, tenant);
    // Même utilisateur dans une autre session → confirmation « reprendre ici ? » (reprise auditée) ;
    // un autre utilisateur reste bloqué (CONFLICT) jusqu'à expiration ou libération administrative.
    const outcome = yield* blogPostLock.acquire(input.id, lockOwnerFrom(user.id, context.locals.session?.id), { takeOver: input.takeOver, locale: lockLocaleFrom(context.request.headers) }).pipe(
      Effect.map((acquired) => ({ ok: true as const, ...acquired })),
      Effect.catchTag("LockHeldError", (error) => (error.sameUser ? Effect.succeed({ ok: false as const, takeOverPrompt: error.message }) : Effect.fail(error))),
    );
    if (!outcome.ok) return { success: false, takeOverPrompt: outcome.takeOverPrompt };
    if (outcome.tookOverFrom !== null) {
      auditBlog(context, user.id, "BLOG_POST_LOCK_TAKEOVER", { resource: "blog_posts", resourceId: input.id, metadata: { previousSessionId: outcome.tookOverFrom } });
    }
    return { success: true, expiresAt: outcome.expiresAt };
  })),
});

export const unlockBlogPost = defineAction({
  input: z.object({ id: z.uuid(), organizationId: blogOrganizationIdSchema }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blog: ["update"] });
    yield* postInTenant(input.id, tenant);
    yield* blogPostLock.release(input.id, lockOwnerFrom(user.id, context.locals.session?.id));
    invalidateBlogCache();
    return { success: true };
  })),
});

export const listBlogPostRevisions = defineAction({
  input: z.object({ postId: z.uuid(), organizationId: blogOrganizationIdSchema }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    yield* requireBlogPermission(context, tenant, { blog: ["read"] });
    yield* postInTenant(input.postId, tenant);
    return yield* actionTry("blog/post.listBlogPostRevisions", async () => {

    const db = getDrizzle();
    return db.select().from(blogPostRevisions).where(eq(blogPostRevisions.postId, input.postId)).orderBy(desc(blogPostRevisions.createdAt)).limit(50);
  }); })),
});
