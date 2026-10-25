import { Effect } from "effect";
import { blogPostLock } from "@/modules/blog/locks";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { defineAction } from "astro:actions";
import { BulkActionError, runBulkAction } from "@/core/bulk";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "astro/zod";
import { getDrizzle } from "@database/drizzle";
import { blogPostRevisions, blogPostTranslations, blogPosts } from "@database/schemas";
import { BLOG_POST_TRANSITIONS, type BlogPostStatus } from "@/lib/blog/constants";
import { blogOrganizationIdSchema, resolveBlogTenant, invalidateBlogCache, auditBlog, requireBlogPermission } from "./_helpers";
import { ActionFailure, actionTry, effectHandler } from "@/lib/effect/action";

const bulkInput = z.object({ ids: z.array(z.uuid()).min(1).max(100), organizationId: blogOrganizationIdSchema, operation: z.enum(["publish", "archive", "restore", "delete"]) });
type BulkOperation = z.infer<typeof bulkInput>["operation"];
const tenantPredicate = (organizationId: string | null) => organizationId === null ? isNull(blogPosts.organizationId) : eq(blogPosts.organizationId, organizationId);
const targetStatus: Record<BulkOperation, BlogPostStatus> = { publish: "PUBLISHED", archive: "ARCHIVED", restore: "DRAFT", delete: "DELETED" };
const permissionFor: Record<BulkOperation, "publish" | "update" | "delete"> = { publish: "publish", archive: "update", restore: "update", delete: "delete" };
const auditFor: Record<BulkOperation, "BLOG_POST_PUBLISH" | "BLOG_POST_ARCHIVE" | "BLOG_POST_RESTORE" | "BLOG_POST_DELETE"> = { publish: "BLOG_POST_PUBLISH", archive: "BLOG_POST_ARCHIVE", restore: "BLOG_POST_RESTORE", delete: "BLOG_POST_DELETE" };

/** Erreur du moteur d'actions groupées → erreur d'action Astro (même codes). */
const toAction = <A, E>(effect: Effect.Effect<A, E | BulkActionError>): Effect.Effect<A, E | ActionFailure> =>
  effect.pipe(Effect.mapError((e) => (e instanceof BulkActionError ? new ActionFailure({ code: e.code, message: e.message }) : e)));

export const bulkBlogPostLifecycle = defineAction({
  input: bulkInput,
  handler: effectHandler((input, context) => {
    const tenant = resolveBlogTenant(input);
    const db = getDrizzle();
    type Row = typeof blogPosts.$inferSelect;
    type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
    type Actor = { id: string };
    const to = targetStatus[input.operation];
    const operation = {
      validate: (row: Row) => BLOG_POST_TRANSITIONS[row.status as BlogPostStatus].includes(to) ? null : `Transition de statut invalide : ${row.status} → ${to}.`,
      apply: async (tx: Tx, row: Row, actor: Actor) => {
        await tx.update(blogPosts).set({ status: to, publishedAt: to === "PUBLISHED" ? new Date() : null, updatedBy: actor.id }).where(eq(blogPosts.id, row.id));
        const [translation] = await tx.select().from(blogPostTranslations).where(eq(blogPostTranslations.postId, row.id)).orderBy(desc(blogPostTranslations.updatedAt), desc(blogPostTranslations.id)).limit(1);
        if (translation) await tx.insert(blogPostRevisions).values({ postId: row.id, authorId: actor.id, locale: translation.locale, title: translation.title, slug: translation.slug, content: translation.content, excerpt: translation.excerpt, status: to === "PUBLISHED" ? "PUBLISHED" : to === "ARCHIVED" ? "ARCHIVED" : "DRAFT", revisionNote: `Action groupée : ${input.operation}` });
      },
      auditAction: auditFor[input.operation],
      auditMetadata: (row: Row) => ({ organizationId: tenant.organizationId, from: row.status, to }),
      destructive: input.operation === "delete",
    };
    return toAction(runBulkAction({
      resource: "blog_posts",
      operations: { publish: operation, archive: operation, restore: operation, delete: operation } as Record<BulkOperation, typeof operation>,
      authorize: (op: BulkOperation) => requireBlogPermission(context, tenant, { blog: [permissionFor[op]] }),
      load: (ids) => actionTry("blog/bulk.bulkBlogPostLifecycle.load", () => db.select().from(blogPosts).where(and(tenantPredicate(tenant.organizationId), inArray(blogPosts.id, [...ids])))),
      // Aucun article ne doit être verrouillé par un autre propriétaire (utilisateur + session) — verrou générique.
      guard: (ids, actor) => blogPostLock.ensureNoneLockedByOther([...ids], lockOwnerFrom(actor.id, context.locals.session?.id), lockLocaleFrom(context.request.headers)),
      transaction: (body) => db.transaction((tx) => body(tx)),
      audit: (actor, action, entry) => auditBlog(context, actor.id, action as (typeof auditFor)[BulkOperation], entry),
      afterCommit: () => invalidateBlogCache(),
    }, { ids: input.ids, operation: input.operation })).pipe(Effect.map((r) => ({ updated: r.updated })));
  }),
});
