import { Effect } from "effect";
import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogPostLinks } from "@database/schemas";
import { blogLinkFormSchema, blogLinkUpdateSchema } from "@/lib/blog/validation";
import {
  resolveBlogTenant,
  auditBlog,
  invalidateBlogCache,
  blogOrganizationIdSchema,
  blogRateLimitEffect,
  postInTenant,
  requireBlogPermission,
} from "./_helpers";
import { actionTry, effectHandler, fail } from "@/lib/effect/action";

export const createBlogLink = defineAction({
  input: blogLinkFormSchema.extend({
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blog: ["update"] });
    yield* blogRateLimitEffect(user.id, "link-create");

    yield* postInTenant(input.sourcePostId, tenant);
    yield* postInTenant(input.targetPostId, tenant);
    return yield* actionTry("blog/link.createBlogLink", async () => {
    if (input.sourcePostId === input.targetPostId) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Un article ne peut pas être lié à lui-même.",
      });
    }

    const db = getDrizzle();

    const [link] = await db
      .insert(blogPostLinks)
      .values({
        sourcePostId: input.sourcePostId,
        targetPostId: input.targetPostId,
        linkType: input.linkType,
        sortOrder: input.sortOrder,
      })
      .returning();

    auditBlog(context, user.id, "BLOG_LINK_CREATE", {
      resource: "blog_post_links",
      resourceId: link.id,
      metadata: { sourcePostId: input.sourcePostId, targetPostId: input.targetPostId, linkType: input.linkType },
    });

    invalidateBlogCache();
    return { id: link.id };
  }); })),
});

/** Lien existant dont l'article source appartient au tenant (Effect : NOT_FOUND / FORBIDDEN typés). */
const linkInTenant = (linkId: string, tenant: ReturnType<typeof resolveBlogTenant>) =>
  Effect.gen(function* () {
    const [link] = yield* actionTry("blog/link.load", () =>
      getDrizzle().select().from(blogPostLinks).where(eq(blogPostLinks.id, linkId)).limit(1),
    );
    if (!link) return yield* fail("NOT_FOUND", "Lien introuvable.");
    yield* postInTenant(link.sourcePostId, tenant);
    return link;
  });

export const updateBlogLink = defineAction({
  input: blogLinkUpdateSchema.extend({
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blog: ["update"] });
    yield* blogRateLimitEffect(user.id, "link-update");
    yield* linkInTenant(input.id, tenant);
    return yield* actionTry("blog/link.updateBlogLink", async () => {
    const db = getDrizzle();

    await db
      .update(blogPostLinks)
      .set({
        ...(input.linkType ? { linkType: input.linkType } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      })
      .where(eq(blogPostLinks.id, input.id));

    auditBlog(context, user.id, "BLOG_LINK_UPDATE", {
      resource: "blog_post_links",
      resourceId: input.id,
      metadata: { linkType: input.linkType, sortOrder: input.sortOrder },
    });

    invalidateBlogCache();
    return { success: true };
  }); })),
});

export const deleteBlogLink = defineAction({
  input: z.object({
    id: z.uuid(),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blog: ["update"] });
    yield* blogRateLimitEffect(user.id, "link-delete");
    const link = yield* linkInTenant(input.id, tenant);
    return yield* actionTry("blog/link.deleteBlogLink", async () => {
    const db = getDrizzle();

    await db.delete(blogPostLinks).where(eq(blogPostLinks.id, input.id));

    auditBlog(context, user.id, "BLOG_LINK_DELETE", {
      resource: "blog_post_links",
      resourceId: input.id,
      metadata: { sourcePostId: link.sourcePostId, targetPostId: link.targetPostId },
    });

    invalidateBlogCache();
    return { success: true };
  }); })),
});
