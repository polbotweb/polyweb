import { defineAction, ActionError, type ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogPosts, blogPostTranslations, blogPostCategories, blogPostTags, blogPostRevisions, blogPostSeo, blogPostGalleries, blogPostGalleryMedia, blogPostLinks, blogPostLocks } from "@database/schemas";
import { LOCALES, type Locale } from "@i18n/config";
import { BLOG_POST_TRANSITIONS, type BlogPostStatus } from "@/lib/blog/constants";
import { assertBlogPermission, assertPostInTenant, auditBlog, blogOrganizationIdSchema, blogRateLimit, invalidateBlogCache, resolveBlogTenant } from "./_helpers";

type Db = ReturnType<typeof getDrizzle>;
type DbTransaction = Parameters<Db["transaction"]>[0] extends (tx: infer T, ...args: never[]) => unknown ? T : never;
const lifecycleInput = z.object({ id: z.uuid(), organizationId: blogOrganizationIdSchema });

function assertTransition(from: BlogPostStatus, to: BlogPostStatus): void {
  if (!BLOG_POST_TRANSITIONS[from].includes(to)) throw new ActionError({ code: "BAD_REQUEST", message: `Transition de statut invalide : ${from} → ${to}.` });
}
function assertRevisionRestoreStatus(from: BlogPostStatus, to: BlogPostStatus): void { if (from !== to) assertTransition(from, to); }
function revisionStatus(status: BlogPostStatus): "DRAFT" | "PUBLISHED" | "ARCHIVED" { return status === "PUBLISHED" || status === "ARCHIVED" ? status : "DRAFT"; }

async function appendRevision(tx: DbTransaction, postId: string, userId: string, status: BlogPostStatus, revisionNote: string, locale?: Locale) {
  const [translation] = await tx.select().from(blogPostTranslations).where(and(eq(blogPostTranslations.postId, postId), locale ? eq(blogPostTranslations.locale, locale) : eq(blogPostTranslations.locale, LOCALES[0]))).orderBy(desc(blogPostTranslations.updatedAt), desc(blogPostTranslations.id)).limit(1);
  if (!translation) return;
  await tx.insert(blogPostRevisions).values({ postId, authorId: userId, locale: translation.locale, title: translation.title, slug: translation.slug, content: translation.content, excerpt: translation.excerpt, status: revisionStatus(status), revisionNote });
}

async function performTransition(input: z.infer<typeof lifecycleInput>, context: ActionAPIContext, to: BlogPostStatus, permission: "publish" | "update", action: "BLOG_POST_PUBLISH" | "BLOG_POST_UNPUBLISH" | "BLOG_POST_ARCHIVE" | "BLOG_POST_RESTORE", note: string) {
  const tenant = resolveBlogTenant(input); const user = await assertBlogPermission(context, tenant, { blog: [permission] }); blogRateLimit(context, user.id, `post-${action.toLowerCase()}`); const post = await assertPostInTenant(input.id, tenant); assertTransition(post.status as BlogPostStatus, to);
  await getDrizzle().transaction(async (tx) => { await tx.update(blogPosts).set({ status: to, publishedAt: to === "PUBLISHED" ? new Date() : null, updatedBy: user.id }).where(eq(blogPosts.id, input.id)); await appendRevision(tx, input.id, user.id, to, note); });
  auditBlog(context, user.id, action, { resource: "blog_posts", resourceId: input.id, metadata: { organizationId: tenant.organizationId, from: post.status, to } }); invalidateBlogCache(); return { success: true };
}

export const publishBlogPost = defineAction({ input: lifecycleInput, handler: (input, context) => performTransition(input, context, "PUBLISHED", "publish", "BLOG_POST_PUBLISH", "Publication") });
export const unpublishBlogPost = defineAction({ input: lifecycleInput, handler: (input, context) => performTransition(input, context, "DRAFT", "publish", "BLOG_POST_UNPUBLISH", "Dépublication") });
export const archiveBlogPost = defineAction({ input: lifecycleInput, handler: (input, context) => performTransition(input, context, "ARCHIVED", "update", "BLOG_POST_ARCHIVE", "Archivage") });
export const restoreBlogPost = defineAction({ input: lifecycleInput, handler: (input, context) => performTransition(input, context, "DRAFT", "update", "BLOG_POST_RESTORE", "Restauration") });

export const deleteBlogPost = defineAction({ input: lifecycleInput, handler: async (input, context) => { const tenant = resolveBlogTenant(input); const user = await assertBlogPermission(context, tenant, { blog: ["delete"] }); blogRateLimit(context, user.id, "post-delete"); const post = await assertPostInTenant(input.id, tenant); assertTransition(post.status as BlogPostStatus, "DELETED"); await getDrizzle().transaction(async (tx) => { await tx.update(blogPosts).set({ status: "DELETED", publishedAt: null, updatedBy: user.id }).where(eq(blogPosts.id, input.id)); await appendRevision(tx, input.id, user.id, "DELETED", "Suppression"); }); auditBlog(context, user.id, "BLOG_POST_DELETE", { resource: "blog_posts", resourceId: input.id, metadata: { organizationId: tenant.organizationId, from: post.status, to: "DELETED" } }); invalidateBlogCache(); return { success: true }; } });

export const duplicateBlogPost = defineAction({ input: lifecycleInput, handler: async (input, context) => {
  const tenant = resolveBlogTenant(input); const user = await assertBlogPermission(context, tenant, { blog: ["create"] }); const source = await assertPostInTenant(input.id, tenant); const db = getDrizzle();
  const [translations, categories, tags, seo, galleries, links] = await Promise.all([
    db.select().from(blogPostTranslations).where(eq(blogPostTranslations.postId, input.id)).orderBy(blogPostTranslations.locale),
    db.select({ categoryId: blogPostCategories.categoryId }).from(blogPostCategories).where(eq(blogPostCategories.postId, input.id)),
    db.select({ tagId: blogPostTags.tagId }).from(blogPostTags).where(eq(blogPostTags.postId, input.id)),
    db.select().from(blogPostSeo).where(eq(blogPostSeo.postId, input.id)),
    db.select().from(blogPostGalleries).where(eq(blogPostGalleries.postId, input.id)),
    db.select().from(blogPostLinks).where(eq(blogPostLinks.sourcePostId, input.id)),
  ]);
  if (!translations.length) throw new ActionError({ code: "BAD_REQUEST", message: "Impossible de dupliquer un article sans traduction." });
  const canonicalSlug = await uniqueCopySlug(db, tenant.organizationId, source.slug);
  const duplicated = await db.transaction(async (tx) => {
    const [post] = await tx.insert(blogPosts).values({ organizationId: tenant.organizationId, authorId: source.authorId, slug: canonicalSlug, status: "DRAFT", featuredImageId: source.featuredImageId, isFeatured: source.isFeatured, isSticky: false, commentStatus: source.commentStatus, allowReviews: source.allowReviews, seoScore: source.seoScore, publishedAt: null, updatedBy: user.id }).returning();
    for (const translation of translations) { const translationSlug = translation.locale === LOCALES[0] ? canonicalSlug : await uniqueTranslationCopySlug(tx, tenant.organizationId, translation.locale, translation.slug); await tx.insert(blogPostTranslations).values({ postId: post.id, organizationId: tenant.organizationId, locale: translation.locale, title: translation.title, slug: translationSlug, content: translation.content, excerpt: translation.excerpt, metaTitle: translation.metaTitle, metaDescription: translation.metaDescription, metaKeywords: translation.metaKeywords, canonicalUrl: null, ogTitle: translation.ogTitle, ogDescription: translation.ogDescription, ogImageId: translation.ogImageId }); }
    if (categories.length) await tx.insert(blogPostCategories).values(categories.map(({ categoryId }) => ({ postId: post.id, categoryId })));
    if (tags.length) await tx.insert(blogPostTags).values(tags.map(({ tagId }) => ({ postId: post.id, tagId })));
    if (seo.length) await tx.insert(blogPostSeo).values(seo.map(({ id: _id, postId: _postId, ...rest }) => ({ postId: post.id, ...rest })));
    for (const gallery of galleries) { const [newGallery] = await tx.insert(blogPostGalleries).values({ postId: post.id, title: gallery.title, description: gallery.description, sortOrder: gallery.sortOrder }).returning(); const media = await tx.select().from(blogPostGalleryMedia).where(eq(blogPostGalleryMedia.galleryId, gallery.id)); if (media.length) await tx.insert(blogPostGalleryMedia).values(media.map(({ galleryId: _old, ...item }) => ({ galleryId: newGallery.id, ...item }))); }
    for (const link of links) { const [target] = await tx.select({ id: blogPosts.id }).from(blogPosts).where(and(eq(blogPosts.id, link.targetPostId), tenantScope(tenant.organizationId))).limit(1); if (target && target.id !== post.id) await tx.insert(blogPostLinks).values({ sourcePostId: post.id, targetPostId: target.id, linkType: link.linkType, sortOrder: link.sortOrder }); }
    await appendRevision(tx, post.id, user.id, "DRAFT", "Duplication initiale", translations[0].locale);
    return post;
  });
  auditBlog(context, user.id, "BLOG_POST_CREATE", { resource: "blog_posts", resourceId: duplicated.id, metadata: { organizationId: tenant.organizationId, duplicatedFrom: input.id } }); invalidateBlogCache(); return { id: duplicated.id, slug: duplicated.slug };
} });

export const restoreBlogPostRevision = defineAction({ input: z.object({ postId: z.uuid(), revisionId: z.uuid(), organizationId: blogOrganizationIdSchema }), handler: async (input, context) => {
  const tenant = resolveBlogTenant(input); const post = await assertPostInTenant(input.postId, tenant); const db = getDrizzle(); const [revision] = await db.select().from(blogPostRevisions).where(and(eq(blogPostRevisions.id, input.revisionId), eq(blogPostRevisions.postId, input.postId))).limit(1); if (!revision) throw new ActionError({ code: "NOT_FOUND", message: "Révision introuvable." }); const targetStatus = revision.status as BlogPostStatus; const requiredPermission = targetStatus === "PUBLISHED" ? "publish" : "update"; const user = await assertBlogPermission(context, tenant, { blog: [requiredPermission] }); const [lock] = await db.select().from(blogPostLocks).where(eq(blogPostLocks.postId, input.postId)).limit(1); const sessionId = context.locals.session?.id ?? ""; if (!lock || lock.expiresAt <= new Date() || lock.userId !== user.id || lock.sessionId !== sessionId) throw new ActionError({ code: "CONFLICT", message: "Le verrou de modification est requis pour restaurer une révision." }); assertRevisionRestoreStatus(post.status as BlogPostStatus, targetStatus);
  await db.transaction(async (tx) => { const [translation] = await tx.select().from(blogPostTranslations).where(and(eq(blogPostTranslations.postId, input.postId), eq(blogPostTranslations.locale, revision.locale))).limit(1); if (translation) await tx.update(blogPostTranslations).set({ title: revision.title, slug: revision.slug, content: revision.content, excerpt: revision.excerpt }).where(eq(blogPostTranslations.id, translation.id)); else await tx.insert(blogPostTranslations).values({ postId: input.postId, organizationId: tenant.organizationId, locale: revision.locale, title: revision.title, slug: revision.slug, content: revision.content, excerpt: revision.excerpt }); await tx.update(blogPosts).set({ slug: revision.slug, status: targetStatus, publishedAt: targetStatus === "PUBLISHED" ? (post.status === "PUBLISHED" ? post.publishedAt : new Date()) : null, updatedBy: user.id }).where(eq(blogPosts.id, input.postId)); await appendRevision(tx, input.postId, user.id, targetStatus, `Restauration de la révision ${revision.id}`, revision.locale); }); auditBlog(context, user.id, "BLOG_POST_UPDATE", { resource: "blog_posts", resourceId: input.postId, metadata: { organizationId: tenant.organizationId, restoredRevisionId: input.revisionId } }); invalidateBlogCache(); return { success: true }; } });

function tenantScope(organizationId: string | null) { return organizationId === null ? isNull(blogPosts.organizationId) : eq(blogPosts.organizationId, organizationId); }
async function uniqueCopySlug(db: Db, organizationId: string | null, sourceSlug: string) { const base = `${sourceSlug}-copy`; let candidate = base; for (let i = 2; ; i += 1) { const [collision] = await db.select({ id: blogPosts.id }).from(blogPosts).where(and(eq(blogPosts.slug, candidate), tenantScope(organizationId))).limit(1); if (!collision) return candidate; candidate = `${base}-${i}`; } }
async function uniqueTranslationCopySlug(tx: DbTransaction, organizationId: string | null, locale: Locale, sourceSlug: string) { const base = `${sourceSlug}-copy`; let candidate = base; for (let i = 2; ; i += 1) { const org = organizationId === null ? isNull(blogPostTranslations.organizationId) : eq(blogPostTranslations.organizationId, organizationId); const [collision] = await tx.select({ id: blogPostTranslations.id }).from(blogPostTranslations).where(and(eq(blogPostTranslations.slug, candidate), eq(blogPostTranslations.locale, locale), org)).limit(1); if (!collision) return candidate; candidate = `${base}-${i}`; } }
