import { ActionError, defineAction } from "astro:actions";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "astro/zod";
import { getDrizzle } from "@database/drizzle";
import { blogPostLocks, blogPostRevisions, blogPostTranslations, blogPosts } from "@database/schemas";
import { BLOG_POST_TRANSITIONS, type BlogPostStatus } from "@/lib/blog/constants";
import { assertBlogPermission, blogOrganizationIdSchema, resolveBlogTenant, invalidateBlogCache, auditBlog } from "./_helpers";

const bulkInput = z.object({ ids: z.array(z.uuid()).min(1).max(100), organizationId: blogOrganizationIdSchema, operation: z.enum(["publish", "archive", "restore", "delete"]) });
type BulkOperation = z.infer<typeof bulkInput>["operation"];
const tenantPredicate = (organizationId: string | null) => organizationId === null ? isNull(blogPosts.organizationId) : eq(blogPosts.organizationId, organizationId);
const targetStatus: Record<BulkOperation, BlogPostStatus> = { publish: "PUBLISHED", archive: "ARCHIVED", restore: "DRAFT", delete: "DELETED" };
const permissionFor: Record<BulkOperation, "publish" | "update" | "delete"> = { publish: "publish", archive: "update", restore: "update", delete: "delete" };
const auditFor: Record<BulkOperation, "BLOG_POST_PUBLISH" | "BLOG_POST_ARCHIVE" | "BLOG_POST_RESTORE" | "BLOG_POST_DELETE"> = { publish: "BLOG_POST_PUBLISH", archive: "BLOG_POST_ARCHIVE", restore: "BLOG_POST_RESTORE", delete: "BLOG_POST_DELETE" };

function assertTransition(from: BlogPostStatus, to: BlogPostStatus) {
  if (!BLOG_POST_TRANSITIONS[from].includes(to)) throw new ActionError({ code: "BAD_REQUEST", message: `Transition de statut invalide : ${from} → ${to}.` });
}

export const bulkBlogPostLifecycle = defineAction({
  input: bulkInput,
  handler: async (input, context) => {
    const tenant = resolveBlogTenant(input);
    const user = await assertBlogPermission(context, tenant, { blog: [permissionFor[input.operation]] });
    const db = getDrizzle();
    const rows = await db.select().from(blogPosts).where(and(tenantPredicate(tenant.organizationId), inArray(blogPosts.id, input.ids)));
    if (rows.length !== input.ids.length) throw new ActionError({ code: "FORBIDDEN", message: "Un ou plusieurs articles ne sont pas accessibles dans ce tenant." });
    const locks = await db.select().from(blogPostLocks).where(inArray(blogPostLocks.postId, input.ids));
    const sessionId = context.locals.session?.id ?? ""; const now = new Date();
    for (const lock of locks) if (lock.expiresAt > now && (lock.userId !== user.id || lock.sessionId !== sessionId)) throw new ActionError({ code: "CONFLICT", message: "Un des articles sélectionnés est actuellement verrouillé par un autre éditeur." });
    const to = targetStatus[input.operation];
    for (const row of rows) assertTransition(row.status as BlogPostStatus, to);
    await db.transaction(async (tx) => {
      for (const row of rows) {
        await tx.update(blogPosts).set({ status: to, publishedAt: to === "PUBLISHED" ? new Date() : null, updatedBy: user.id }).where(eq(blogPosts.id, row.id));
        const [translation] = await tx.select().from(blogPostTranslations).where(eq(blogPostTranslations.postId, row.id)).orderBy(desc(blogPostTranslations.updatedAt), desc(blogPostTranslations.id)).limit(1);
        if (translation) await tx.insert(blogPostRevisions).values({ postId: row.id, authorId: user.id, locale: translation.locale, title: translation.title, slug: translation.slug, content: translation.content, excerpt: translation.excerpt, status: to === "PUBLISHED" ? "PUBLISHED" : to === "ARCHIVED" ? "ARCHIVED" : "DRAFT", revisionNote: `Action groupée : ${input.operation}` });
      }
    });
    for (const row of rows) auditBlog(context, user.id, auditFor[input.operation], { resource: "blog_posts", resourceId: row.id, metadata: { organizationId: tenant.organizationId, bulk: true, from: row.status, to } });
    invalidateBlogCache();
    return { updated: rows.length };
  },
});
