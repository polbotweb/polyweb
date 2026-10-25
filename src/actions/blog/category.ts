import { Effect } from "effect";
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, isNull, or } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogCategories, blogCategoryTranslations, blogPostCategories } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { DEFAULT_LOCALE, type Locale } from "@i18n/config";
import { blogCategoryFormSchema, blogCategoryUpdateSchema } from "@/lib/blog/validation";
import { assertAcyclicParent } from "@/lib/cms/taxonomy";
import { resolveBlogTenant, auditBlog, blogOrganizationIdSchema, blogRateLimitEffect, categoryInTenant, requireBlogPermission } from "./_helpers";
import { actionTry, effectHandler, fail } from "@/lib/effect/action";

function categoryTenantScope(organizationId: string | null) {
  return organizationId === null ? isNull(blogCategories.organizationId) : eq(blogCategories.organizationId, organizationId);
}

// Contrôles de cohérence en Effect natif (lecture via actionTry, échec métier typé via fail).
const baseCategorySlugAvailable = (organizationId: string | null, slug: string, currentCategoryId?: string) =>
  Effect.gen(function* () {
    const [existing] = yield* actionTry("blog/category.slug.base", () => getDrizzle().select({ id: blogCategories.id }).from(blogCategories).where(and(categoryTenantScope(organizationId), eq(blogCategories.slug, slug))).limit(1));
    if (existing && existing.id !== currentCategoryId) return yield* fail("CONFLICT", `Une autre catégorie utilise déjà le slug « ${slug} » comme slug canonique.`);
  });

const localizedCategorySlugAvailable = (organizationId: string | null, locale: Locale, slug: string, currentCategoryId?: string) =>
  Effect.gen(function* () {
    const [existing] = yield* actionTry("blog/category.slug.localized", () => getDrizzle().select({ id: blogCategories.id }).from(blogCategories).leftJoin(blogCategoryTranslations, and(eq(blogCategoryTranslations.categoryId, blogCategories.id), eq(blogCategoryTranslations.locale, locale))).where(and(categoryTenantScope(organizationId), or(eq(blogCategoryTranslations.slug, slug), and(isNull(blogCategoryTranslations.id), eq(blogCategories.slug, slug))))).limit(1));
    if (existing && existing.id !== currentCategoryId) return yield* fail("CONFLICT", `Une autre catégorie utilise déjà le slug « ${slug} » pour la locale « ${locale} ».`);
  });

const categoryParentIsAcyclic = (categoryId: string | null, parentId: string | null, organizationId: string | null) =>
  Effect.gen(function* () {
    if (!parentId) return;
    const rows = yield* actionTry("blog/category.hierarchy", () => getDrizzle().select({ id: blogCategories.id, parentId: blogCategories.parentId }).from(blogCategories).where(categoryTenantScope(organizationId)));
    const problem = yield* Effect.sync(() => {
      try {
        assertAcyclicParent(rows, categoryId, parentId);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Invalid taxonomy hierarchy.";
      }
    });
    if (problem !== null) return yield* fail("BAD_REQUEST", problem);
  });

export const createBlogCategory = defineAction({
  input: blogCategoryFormSchema.extend({ organizationId: blogOrganizationIdSchema }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blogCategory: ["create"] });
    yield* blogRateLimitEffect(user.id, "category-create");
    yield* categoryParentIsAcyclic(null, input.parentId ?? null, tenant.organizationId);
    yield* baseCategorySlugAvailable(tenant.organizationId, input.slug);
    yield* localizedCategorySlugAvailable(tenant.organizationId, input.locale, input.slug);
    return yield* actionTry("blog/category.createBlogCategory", async () => {
    const db = getDrizzle();
    const category = await db.transaction(async (tx) => {
      const [created] = await tx.insert(blogCategories).values({ organizationId: tenant.organizationId, parentId: input.parentId, slug: input.slug, icon: input.icon, color: input.color, sortOrder: input.sortOrder ?? 0 }).returning();
      await tx.insert(blogCategoryTranslations).values({ categoryId: created.id, organizationId: tenant.organizationId, locale: input.locale, name: input.name, slug: input.slug, description: input.description, metaTitle: input.metaTitle, metaDescription: input.metaDescription });
      return created;
    });
    auditBlog(context, user.id, "BLOG_CATEGORY_CREATE", { resource: "blog_categories", resourceId: category.id, metadata: { organizationId: tenant.organizationId, locale: input.locale, slug: input.slug } });
    invalidateCache("blog:categories");
    return { id: category.id, slug: input.slug };
  }); })),
});

export const updateBlogCategory = defineAction({
  input: blogCategoryUpdateSchema.extend({ organizationId: blogOrganizationIdSchema }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blogCategory: ["update"] });
    yield* blogRateLimitEffect(user.id, "category-update");
    const { id, organizationId: _, ...data } = input;
    yield* categoryInTenant(id, tenant);
    yield* categoryParentIsAcyclic(id, data.parentId ?? null, tenant.organizationId);
    if (data.slug) {
      if (!data.locale || data.locale === DEFAULT_LOCALE) yield* baseCategorySlugAvailable(tenant.organizationId, data.slug, id);
      if (data.locale) yield* localizedCategorySlugAvailable(tenant.organizationId, data.locale, data.slug, id);
    }
    return yield* actionTry("blog/category.updateBlogCategory", async () => {
    const db = getDrizzle();
    await db.transaction(async (tx) => {
      await tx.update(blogCategories).set({ parentId: data.parentId, ...((data.slug !== undefined && (!data.locale || data.locale === DEFAULT_LOCALE)) ? { slug: data.slug } : {}), icon: data.icon, color: data.color, sortOrder: data.sortOrder }).where(eq(blogCategories.id, id));
      if (data.locale) {
        const [translation] = await tx.select().from(blogCategoryTranslations).where(and(eq(blogCategoryTranslations.categoryId, id), eq(blogCategoryTranslations.locale, data.locale))).limit(1);
        if (translation) await tx.update(blogCategoryTranslations).set({ name: data.name, slug: data.slug, description: data.description, metaTitle: data.metaTitle, metaDescription: data.metaDescription }).where(eq(blogCategoryTranslations.id, translation.id));
        else await tx.insert(blogCategoryTranslations).values({ categoryId: id, organizationId: tenant.organizationId, locale: data.locale, name: data.name!, slug: data.slug!, description: data.description, metaTitle: data.metaTitle, metaDescription: data.metaDescription });
      }
    });
    auditBlog(context, user.id, "BLOG_CATEGORY_UPDATE", { resource: "blog_categories", resourceId: id, metadata: { organizationId: tenant.organizationId, locale: data.locale, slug: data.slug } });
    invalidateCache("blog:categories");
    return { id };
  }); })),
});

export const deleteBlogCategory = defineAction({
  input: z.object({ id: z.uuid(), organizationId: blogOrganizationIdSchema, reassignToId: z.uuid().optional() }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveBlogTenant(input);
    const user = yield* requireBlogPermission(context, tenant, { blogCategory: ["delete"] });
    yield* blogRateLimitEffect(user.id, "category-delete");
    yield* categoryInTenant(input.id, tenant);
    if (input.reassignToId) yield* categoryInTenant(input.reassignToId, tenant);
    return yield* actionTry("blog/category.deleteBlogCategory", async () => {
    const db = getDrizzle();
    await db.transaction(async (tx) => {
      if (input.reassignToId) {
        const affected = await tx.select({ postId: blogPostCategories.postId }).from(blogPostCategories).where(eq(blogPostCategories.categoryId, input.id));
        if (affected.length) {
          await tx.delete(blogPostCategories).where(eq(blogPostCategories.categoryId, input.id));
          await tx.insert(blogPostCategories).values(affected.map(({ postId }) => ({ postId, categoryId: input.reassignToId! }))).onConflictDoNothing();
        }
      }
      await tx.delete(blogCategories).where(eq(blogCategories.id, input.id));
    });
    auditBlog(context, user.id, "BLOG_CATEGORY_DELETE", { resource: "blog_categories", resourceId: input.id, metadata: { organizationId: tenant.organizationId, reassignToId: input.reassignToId } });
    invalidateCache("blog:categories");
    return { success: true };
  }); })),
});
