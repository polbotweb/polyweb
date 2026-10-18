import { Effect } from "effect";
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, isNull, or } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogTags, blogTagTranslations, blogPostTags } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { DEFAULT_LOCALE, type Locale } from "@i18n/config";
import { blogTagFormSchema, blogTagUpdateSchema } from "@/lib/blog/validation";
import {
  resolveBlogTenant,
  auditBlog,
  blogOrganizationIdSchema,
  blogRateLimitEffect,
  requireBlogPermission,
  tagInTenant,
} from "./_helpers";
import { actionTry, effectHandler, fail } from "@/lib/effect/action";

function tagTenantScope(organizationId: string | null) {
  return organizationId === null ? isNull(blogTags.organizationId) : eq(blogTags.organizationId, organizationId);
}

// Contrôles d'unicité des slugs en Effect natif (lecture via actionTry, CONFLICT via fail).
const baseTagSlugAvailable = (organizationId: string | null, slug: string, currentTagId?: string) =>
  Effect.gen(function* () {
    const [existing] = yield* actionTry("blog/tag.slug.base", () =>
      getDrizzle()
        .select({ id: blogTags.id })
        .from(blogTags)
        .where(and(tagTenantScope(organizationId), eq(blogTags.slug, slug)))
        .limit(1),
    );
    if (existing && existing.id !== currentTagId) {
      return yield* fail("CONFLICT", `Un autre tag utilise déjà le slug « ${slug} » comme slug canonique.`);
    }
  });

const localizedTagSlugAvailable = (organizationId: string | null, locale: Locale, slug: string, currentTagId?: string) =>
  Effect.gen(function* () {
    const [existing] = yield* actionTry("blog/tag.slug.localized", () =>
      getDrizzle()
        .select({ id: blogTags.id })
        .from(blogTags)
        .leftJoin(
          blogTagTranslations,
          and(eq(blogTagTranslations.tagId, blogTags.id), eq(blogTagTranslations.locale, locale)),
        )
        .where(
          and(
            tagTenantScope(organizationId),
            or(
              eq(blogTagTranslations.slug, slug),
              and(isNull(blogTagTranslations.id), eq(blogTags.slug, slug)),
            ),
          ),
        )
        .limit(1),
    );
    if (existing && existing.id !== currentTagId) {
      return yield* fail("CONFLICT", `Un autre tag utilise déjà le slug « ${slug} » pour la locale « ${locale} ».`);
    }
  });

export const createBlogTag = defineAction({
  input: blogTagFormSchema.extend({
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blogTag: ["create"] });
    yield* blogRateLimitEffect(user.id, "tag-create");
    yield* baseTagSlugAvailable(tenant.organizationId, input.slug);
    yield* localizedTagSlugAvailable(tenant.organizationId, input.locale, input.slug);
    return yield* actionTry("blog/tag.createBlogTag", async () => {

    const db = getDrizzle();


    const [tag] = await db
      .insert(blogTags)
      .values({
        organizationId: tenant.organizationId,
        slug: input.slug,
        color: input.color,
      })
      .returning();

    await db.insert(blogTagTranslations).values({
      tagId: tag.id,
      organizationId: tenant.organizationId,
      locale: input.locale,
      name: input.name,
      slug: input.slug,
    });

    auditBlog(context, user.id, "BLOG_TAG_CREATE", {
      resource: "blog_tags",
      resourceId: tag.id,
      metadata: { organizationId: tenant.organizationId, locale: input.locale, slug: input.slug },
    });

    invalidateCache("blog:tags");
    return { id: tag.id, slug: input.slug };
  }); })),
});

export const updateBlogTag = defineAction({
  input: blogTagUpdateSchema.extend({
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blogTag: ["update"] });
    yield* blogRateLimitEffect(user.id, "tag-update");
    const { id, organizationId: _, ...data } = input;
    yield* tagInTenant(id, tenant);
    if (data.slug) {
      if (!data.locale || data.locale === DEFAULT_LOCALE) yield* baseTagSlugAvailable(tenant.organizationId, data.slug, id);
      if (data.locale) yield* localizedTagSlugAvailable(tenant.organizationId, data.locale, data.slug, id);
    }
    return yield* actionTry("blog/tag.updateBlogTag", async () => {

    const db = getDrizzle();


    await db
      .update(blogTags)
      .set({
        ...((data.slug !== undefined && (!data.locale || data.locale === DEFAULT_LOCALE))
          ? { slug: data.slug }
          : {}),
        color: data.color,
      })
      .where(eq(blogTags.id, id));

    if (data.locale) {
      const [translation] = await db
        .select()
        .from(blogTagTranslations)
        .where(and(eq(blogTagTranslations.tagId, id), eq(blogTagTranslations.locale, data.locale)))
        .limit(1);

      if (translation) {
        await db
          .update(blogTagTranslations)
          .set({ name: data.name, slug: data.slug })
          .where(eq(blogTagTranslations.id, translation.id));
      } else {
        await db.insert(blogTagTranslations).values({
          tagId: id,
          organizationId: tenant.organizationId,
          locale: data.locale,
          name: data.name!,
          slug: data.slug!,
        });
      }
    }

    auditBlog(context, user.id, "BLOG_TAG_UPDATE", {
      resource: "blog_tags",
      resourceId: id,
      metadata: { organizationId: tenant.organizationId, locale: data.locale, slug: data.slug },
    });

    invalidateCache("blog:tags");
    return { id };
  }); })),
});

export const deleteBlogTag = defineAction({
  input: z.object({
    id: z.uuid(),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blogTag: ["delete"] });
    yield* blogRateLimitEffect(user.id, "tag-delete");

    yield* tagInTenant(input.id, tenant);
    return yield* actionTry("blog/tag.deleteBlogTag", async () => {
    const db = getDrizzle();

    await db.delete(blogPostTags).where(eq(blogPostTags.tagId, input.id));
    await db.delete(blogTags).where(eq(blogTags.id, input.id));

    auditBlog(context, user.id, "BLOG_TAG_DELETE", {
      resource: "blog_tags",
      resourceId: input.id,
      metadata: { organizationId: tenant.organizationId },
    });

    invalidateCache("blog:tags");
    return { success: true };
  }); })),
});
