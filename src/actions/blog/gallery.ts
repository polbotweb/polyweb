import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, and } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import {
  blogPostGalleries,
  blogPostGalleryMedia,
} from "@database/schemas";
import {
  assertBlogPermission,
  resolveBlogTenant,
  assertPostInTenant,
  assertMediaInTenant,
  blogRateLimit,
  auditBlog,
  blogOrganizationIdSchema,
} from "./_helpers";

export const createBlogGallery = defineAction({
  input: z.object({
    postId: z.uuid(),
    title: z.string().trim().max(200).optional(),
    description: z.string().trim().max(500).optional(),
    sortOrder: z.number().int().min(0).default(0),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: async (input, context) => {
    const tenant = resolveBlogTenant(input);
    const user = await assertBlogPermission(context, tenant, { blog: ["update"] });
    blogRateLimit(context, user.id, "gallery-create");

    await assertPostInTenant(input.postId, tenant);

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
  },
});

export const updateBlogGallery = defineAction({
  input: z.object({
    id: z.uuid(),
    title: z.string().trim().max(200).optional(),
    description: z.string().trim().max(500).optional(),
    sortOrder: z.number().int().min(0).optional(),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: async (input, context) => {
    const tenant = resolveBlogTenant(input);
    const user = await assertBlogPermission(context, tenant, { blog: ["update"] });
    blogRateLimit(context, user.id, "gallery-update");

    const db = getDrizzle();
    const [gallery] = await db
      .select()
      .from(blogPostGalleries)
      .where(eq(blogPostGalleries.id, input.id))
      .limit(1);
    if (!gallery) throw new ActionError({ code: "NOT_FOUND", message: "Galerie introuvable." });

    await assertPostInTenant(gallery.postId, tenant);

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
  },
});

export const deleteBlogGallery = defineAction({
  input: z.object({
    id: z.uuid(),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: async (input, context) => {
    const tenant = resolveBlogTenant(input);
    const user = await assertBlogPermission(context, tenant, { blog: ["update"] });
    blogRateLimit(context, user.id, "gallery-delete");

    const db = getDrizzle();
    const [gallery] = await db
      .select()
      .from(blogPostGalleries)
      .where(eq(blogPostGalleries.id, input.id))
      .limit(1);
    if (!gallery) throw new ActionError({ code: "NOT_FOUND", message: "Galerie introuvable." });

    await assertPostInTenant(gallery.postId, tenant);

    await db.delete(blogPostGalleries).where(eq(blogPostGalleries.id, input.id));

    auditBlog(context, user.id, "BLOG_GALLERY_DELETE", {
      resource: "blog_post_galleries",
      resourceId: input.id,
      metadata: { postId: gallery.postId },
    });

    return { success: true };
  },
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
  handler: async (input, context) => {
    const tenant = resolveBlogTenant(input);
    const user = await assertBlogPermission(context, tenant, { blog: ["update"] });
    blogRateLimit(context, user.id, "gallery-media-add");

    const db = getDrizzle();
    const [gallery] = await db
      .select()
      .from(blogPostGalleries)
      .where(eq(blogPostGalleries.id, input.galleryId))
      .limit(1);
    if (!gallery) throw new ActionError({ code: "NOT_FOUND", message: "Galerie introuvable." });

    await assertPostInTenant(gallery.postId, tenant);

    await assertMediaInTenant(input.mediaId, tenant);

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
  },
});

export const removeGalleryMedia = defineAction({
  input: z.object({
    galleryId: z.uuid(),
    mediaId: z.uuid(),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: async (input, context) => {
    const tenant = resolveBlogTenant(input);
    const user = await assertBlogPermission(context, tenant, { blog: ["update"] });
    blogRateLimit(context, user.id, "gallery-media-remove");

    const db = getDrizzle();
    const [gallery] = await db
      .select()
      .from(blogPostGalleries)
      .where(eq(blogPostGalleries.id, input.galleryId))
      .limit(1);
    if (!gallery) throw new ActionError({ code: "NOT_FOUND", message: "Galerie introuvable." });

    await assertPostInTenant(gallery.postId, tenant);
    await assertMediaInTenant(input.mediaId, tenant);

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
  },
});
