import { Effect } from "effect";
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { eq, and } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import {
  blogPostGalleries,
  blogPostGalleryMedia,
} from "@database/schemas";
import {
  resolveBlogTenant,
  auditBlog,
  blogOrganizationIdSchema,
  blogRateLimitEffect,
  mediaInTenant,
  postInTenant,
  requireBlogPermission,
} from "./_helpers";
import { actionTry, effectHandler, fail } from "@/lib/effect/action";

export const createBlogGallery = defineAction({
  input: z.object({
    postId: z.uuid(),
    title: z.string().trim().max(200).optional(),
    description: z.string().trim().max(500).optional(),
    sortOrder: z.number().int().min(0).default(0),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blog: ["update"] });
    yield* blogRateLimitEffect(user.id, "gallery-create");

    yield* postInTenant(input.postId, tenant);
    return yield* actionTry("blog/gallery.createBlogGallery", async () => {

    const db = getDrizzle();
    const [gallery] = await db
      .insert(blogPostGalleries)
      .values({
        postId: input.postId,
        title: input.title,
        description: input.description,
        sortOrder: input.sortOrder,
      })
      .returning();

    auditBlog(context, user.id, "BLOG_GALLERY_CREATE", {
      resource: "blog_post_galleries",
      resourceId: gallery.id,
      metadata: { postId: input.postId },
    });

    return { id: gallery.id };
  }); })),
});

/** Galerie existante dont l'article appartient au tenant (Effect : NOT_FOUND / FORBIDDEN typés). */
const galleryInTenant = (galleryId: string, tenant: ReturnType<typeof resolveBlogTenant>) =>
  Effect.gen(function* () {
    const [gallery] = yield* actionTry("blog/gallery.load", () =>
      getDrizzle().select().from(blogPostGalleries).where(eq(blogPostGalleries.id, galleryId)).limit(1),
    );
    if (!gallery) return yield* fail("NOT_FOUND", "Galerie introuvable.");
    yield* postInTenant(gallery.postId, tenant);
    return gallery;
  });

export const updateBlogGallery = defineAction({
  input: z.object({
    id: z.uuid(),
    title: z.string().trim().max(200).optional(),
    description: z.string().trim().max(500).optional(),
    sortOrder: z.number().int().min(0).optional(),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blog: ["update"] });
    yield* blogRateLimitEffect(user.id, "gallery-update");
    const gallery = yield* galleryInTenant(input.id, tenant);
    return yield* actionTry("blog/gallery.updateBlogGallery", async () => {
    const db = getDrizzle();

    await db
      .update(blogPostGalleries)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      })
      .where(eq(blogPostGalleries.id, input.id));

    auditBlog(context, user.id, "BLOG_GALLERY_UPDATE", {
      resource: "blog_post_galleries",
      resourceId: input.id,
      metadata: { postId: gallery.postId },
    });

    return { success: true };
  }); })),
});

export const deleteBlogGallery = defineAction({
  input: z.object({
    id: z.uuid(),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blog: ["update"] });
    yield* blogRateLimitEffect(user.id, "gallery-delete");
    const gallery = yield* galleryInTenant(input.id, tenant);
    return yield* actionTry("blog/gallery.deleteBlogGallery", async () => {
    const db = getDrizzle();

    await db.delete(blogPostGalleries).where(eq(blogPostGalleries.id, input.id));

    auditBlog(context, user.id, "BLOG_GALLERY_DELETE", {
      resource: "blog_post_galleries",
      resourceId: input.id,
      metadata: { postId: gallery.postId },
    });

    return { success: true };
  }); })),
});

export const addGalleryMedia = defineAction({
  input: z.object({
    galleryId: z.uuid(),
    mediaId: z.uuid(),
    altText: z.string().trim().min(1).max(500),
    caption: z.string().trim().max(500).optional(),
    sortOrder: z.number().int().min(0).default(0),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blog: ["update"] });
    yield* blogRateLimitEffect(user.id, "gallery-media-add");
    yield* galleryInTenant(input.galleryId, tenant);
    yield* mediaInTenant(input.mediaId, tenant);
    return yield* actionTry("blog/gallery.addGalleryMedia", async () => {
    const db = getDrizzle();

    const [row] = await db
      .insert(blogPostGalleryMedia)
      .values({
        galleryId: input.galleryId,
        mediaId: input.mediaId,
        altText: input.altText,
        caption: input.caption,
        sortOrder: input.sortOrder,
      })
      .returning();

    auditBlog(context, user.id, "BLOG_GALLERY_MEDIA_ADD", {
      resource: "blog_post_gallery_media",
      resourceId: row.galleryId,
      metadata: { mediaId: input.mediaId, galleryId: input.galleryId },
    });

    return { success: true };
  }); })),
});

export const removeGalleryMedia = defineAction({
  input: z.object({
    galleryId: z.uuid(),
    mediaId: z.uuid(),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blog: ["update"] });
    yield* blogRateLimitEffect(user.id, "gallery-media-remove");
    yield* galleryInTenant(input.galleryId, tenant);
    yield* mediaInTenant(input.mediaId, tenant);
    return yield* actionTry("blog/gallery.removeGalleryMedia", async () => {
    const db = getDrizzle();

    await db
      .delete(blogPostGalleryMedia)
      .where(
        and(
          eq(blogPostGalleryMedia.galleryId, input.galleryId),
          eq(blogPostGalleryMedia.mediaId, input.mediaId),
        ),
      );

    auditBlog(context, user.id, "BLOG_GALLERY_MEDIA_REMOVE", {
      resource: "blog_post_gallery_media",
      resourceId: input.galleryId,
      metadata: { mediaId: input.mediaId, galleryId: input.galleryId },
    });

    return { success: true };
  }); })),
});
