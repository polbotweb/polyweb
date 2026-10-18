import { defineAction, ActionError } from "astro:actions";
import { and, eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { services, serviceTranslations, serviceCategoryLinks, serviceTagLinks, serviceSeo, serviceRevisions } from "@database/schemas";
import { sanitizeHtml } from "@lib/sanitize";
import { generateExcerpt } from "@/core/content/text";
import { serviceFormSchema, serviceUpdateSchema, calculateServiceSeoScore } from "@/modules/services/validation";
import { serviceRateLimit, assertServicePermission, resolveServiceTenant, assertServiceInTenant, assertServiceLockOwner, assertServiceCategoryInTenant, assertServiceTagInTenant, assertServiceMediaInTenant } from "@/modules/services/permissions";
import { auditService, invalidateServicesCache } from "./_helpers";

export const createService = defineAction({
  input: serviceFormSchema,
  handler: async (input, context) => {
    const tenant = resolveServiceTenant(input);
    const user = await assertServicePermission(context, tenant, { service: ["create"] });
    serviceRateLimit(context, user.id, "create");
    const content = sanitizeHtml(input.content);
    const excerpt = input.excerpt?.trim() || generateExcerpt(content);
    const seoScore = calculateServiceSeoScore({ title: input.title, metaTitle: input.metaTitle ?? undefined, metaDescription: input.metaDescription ?? undefined, focusKeyword: input.focusKeyword ?? undefined });
    await Promise.all(input.categoryIds.map((id) => assertServiceCategoryInTenant(id, tenant)));
    await Promise.all(input.tagIds.map((id) => assertServiceTagInTenant(id, tenant)));
    if (input.coverImageId) await assertServiceMediaInTenant(input.coverImageId, tenant);
    if (input.ogImageId) await assertServiceMediaInTenant(input.ogImageId, tenant);

    const db = getDrizzle();
    let createdId = "";
    try {
      await db.transaction(async (tx) => {
        const [created] = await tx.insert(services).values({ organizationId: tenant.organizationId, providerId: user.id, slug: input.slug, status: "DRAFT", coverImageId: input.coverImageId ?? null, priceMinor: input.priceMinor ?? null, currency: input.currency ?? null, durationMinutes: input.durationMinutes ?? null, maxParticipants: input.maxParticipants ?? null, isMobile: input.isMobile, isFeatured: input.isFeatured, seoScore, publishedAt: null, updatedBy: user.id }).returning({ id: services.id });
        if (!created) throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Impossible de créer le service." });
        createdId = created.id;
        await tx.insert(serviceTranslations).values({ serviceId: created.id, organizationId: tenant.organizationId, locale: input.locale, title: input.title, slug: input.slug, excerpt, content, locationLabel: input.locationLabel ?? null, locationAddress: input.locationAddress ?? null, ogImageId: input.ogImageId ?? null, metaTitle: input.metaTitle ?? input.title, metaDescription: input.metaDescription ?? null, metaKeywords: input.metaKeywords ?? null, canonicalUrl: input.canonicalUrl ?? null, ogTitle: input.ogTitle ?? null, ogDescription: input.ogDescription ?? null });
        if (input.categoryIds.length) await tx.insert(serviceCategoryLinks).values(input.categoryIds.map((categoryId) => ({ serviceId: created.id, categoryId })));
        if (input.tagIds.length) await tx.insert(serviceTagLinks).values(input.tagIds.map((tagId) => ({ serviceId: created.id, tagId })));
        await tx.insert(serviceRevisions).values({ serviceId: created.id, authorId: user.id, locale: input.locale, title: input.title, slug: input.slug, content, excerpt, status: "DRAFT", revisionNote: "Création initiale" });
        await tx.insert(serviceSeo).values({ serviceId: created.id, locale: input.locale, focusKeyword: input.focusKeyword ?? null, focusKeywordScore: seoScore });
      });
    } catch (error) {
      if (error instanceof Error && /duplicate|unique/i.test(error.message)) throw new ActionError({ code: "CONFLICT", message: "Un service avec ce slug existe déjà pour ce tenant/locale." });
      throw error;
    }
    auditService(context, user.id, "SERVICE_CREATE", { resource: "services", resourceId: createdId, metadata: { organizationId: tenant.organizationId } });
    invalidateServicesCache();
    return { id: createdId };
  },
});

export const updateService = defineAction({
  input: serviceUpdateSchema,
  handler: async (input, context) => {
    const tenant = resolveServiceTenant(input);
    const user = await assertServicePermission(context, tenant, { service: ["update"] });
    serviceRateLimit(context, user.id, "update");
    const existing = await assertServiceInTenant(input.id, tenant);
    await assertServiceLockOwner(input.id, user.id, context.locals.session?.id);

    if (input.categoryIds) await Promise.all(input.categoryIds.map((id) => assertServiceCategoryInTenant(id, tenant)));
    if (input.tagIds) await Promise.all(input.tagIds.map((id) => assertServiceTagInTenant(id, tenant)));
    if (input.coverImageId) await assertServiceMediaInTenant(input.coverImageId, tenant);
    if (input.ogImageId) await assertServiceMediaInTenant(input.ogImageId, tenant);

    const db = getDrizzle();
    const locale = input.locale;
    const existingTranslation = locale
      ? (await db.select().from(serviceTranslations).where(and(eq(serviceTranslations.serviceId, input.id), eq(serviceTranslations.locale, locale))).limit(1))[0]
      : null;
    const existingSeo = locale
      ? (await db.select().from(serviceSeo).where(and(eq(serviceSeo.serviceId, input.id), eq(serviceSeo.locale, locale))).limit(1))[0]
      : null;
    const focusKeyword = input.focusKeyword !== undefined ? input.focusKeyword ?? undefined : existingSeo?.focusKeyword ?? undefined;
    const content = input.content !== undefined ? sanitizeHtml(input.content) : existingTranslation?.content;
    const excerpt = input.excerpt !== undefined ? input.excerpt?.trim() || (content ? generateExcerpt(content) : null) : existingTranslation?.excerpt;
    const seoScore = calculateServiceSeoScore({ title: input.title ?? existingTranslation?.title, metaTitle: input.metaTitle ?? existingTranslation?.metaTitle ?? undefined, metaDescription: input.metaDescription ?? existingTranslation?.metaDescription ?? undefined, focusKeyword });

    if (locale && !existingTranslation && (!input.title || !input.slug || !content)) throw new ActionError({ code: "BAD_REQUEST", message: "Le titre, le slug et le contenu sont requis pour une nouvelle traduction." });

    try {
      await db.transaction(async (tx) => {
        const serviceUpdate: Partial<typeof services.$inferInsert> = { updatedBy: user.id, seoScore };
        if (input.coverImageId !== undefined) serviceUpdate.coverImageId = input.coverImageId;
        if (input.priceMinor !== undefined) serviceUpdate.priceMinor = input.priceMinor;
        if (input.currency !== undefined) serviceUpdate.currency = input.currency;
        if (input.durationMinutes !== undefined) serviceUpdate.durationMinutes = input.durationMinutes;
        if (input.maxParticipants !== undefined) serviceUpdate.maxParticipants = input.maxParticipants;
        if (input.isMobile !== undefined) serviceUpdate.isMobile = input.isMobile;
        if (input.isFeatured !== undefined) serviceUpdate.isFeatured = input.isFeatured;
        if (locale === undefined && input.slug !== undefined) serviceUpdate.slug = input.slug;
        await tx.update(services).set(serviceUpdate).where(eq(services.id, input.id));

        if (locale) {
          if (existingTranslation) {
            await tx.update(serviceTranslations).set({
              ...(input.title !== undefined ? { title: input.title, metaTitle: input.metaTitle ?? input.title } : {}),
              ...(input.slug !== undefined ? { slug: input.slug } : {}),
              ...(content !== undefined ? { content } : {}),
              ...(input.excerpt !== undefined ? { excerpt } : {}),
              ...(input.metaTitle !== undefined ? { metaTitle: input.metaTitle } : {}),
              ...(input.metaDescription !== undefined ? { metaDescription: input.metaDescription } : {}),
              ...(input.metaKeywords !== undefined ? { metaKeywords: input.metaKeywords } : {}),
              ...(input.canonicalUrl !== undefined ? { canonicalUrl: input.canonicalUrl } : {}),
              ...(input.ogTitle !== undefined ? { ogTitle: input.ogTitle } : {}),
              ...(input.ogDescription !== undefined ? { ogDescription: input.ogDescription } : {}),
              ...(input.ogImageId !== undefined ? { ogImageId: input.ogImageId } : {}),
              ...(input.locationLabel !== undefined ? { locationLabel: input.locationLabel } : {}),
              ...(input.locationAddress !== undefined ? { locationAddress: input.locationAddress } : {}),
            }).where(eq(serviceTranslations.id, existingTranslation.id));
          } else {
            await tx.insert(serviceTranslations).values({ serviceId: input.id, organizationId: tenant.organizationId, locale, title: input.title!, slug: input.slug!, content: content!, excerpt, locationLabel: input.locationLabel ?? null, locationAddress: input.locationAddress ?? null, metaTitle: input.metaTitle ?? input.title, metaDescription: input.metaDescription ?? null, metaKeywords: input.metaKeywords ?? null, canonicalUrl: input.canonicalUrl ?? null, ogTitle: input.ogTitle ?? null, ogDescription: input.ogDescription ?? null, ogImageId: input.ogImageId ?? null });
          }
          if (existingSeo) await tx.update(serviceSeo).set({ ...(input.focusKeyword !== undefined ? { focusKeyword: input.focusKeyword } : {}), focusKeywordScore: seoScore }).where(eq(serviceSeo.id, existingSeo.id));
          else await tx.insert(serviceSeo).values({ serviceId: input.id, locale, focusKeyword: focusKeyword ?? null, focusKeywordScore: seoScore });
        }
        if (input.categoryIds) {
          await tx.delete(serviceCategoryLinks).where(eq(serviceCategoryLinks.serviceId, input.id));
          if (input.categoryIds.length) await tx.insert(serviceCategoryLinks).values(input.categoryIds.map((categoryId) => ({ serviceId: input.id, categoryId })));
        }
        if (input.tagIds) {
          await tx.delete(serviceTagLinks).where(eq(serviceTagLinks.serviceId, input.id));
          if (input.tagIds.length) await tx.insert(serviceTagLinks).values(input.tagIds.map((tagId) => ({ serviceId: input.id, tagId })));
        }
        if (locale && (content !== undefined || input.title !== undefined || input.slug !== undefined)) {
          await tx.insert(serviceRevisions).values({ serviceId: input.id, authorId: user.id, locale, title: input.title ?? existingTranslation?.title ?? "", slug: input.slug ?? existingTranslation?.slug ?? "", content: content ?? existingTranslation?.content ?? "", excerpt: excerpt ?? null, status: existing.status === "DELETED" ? "ARCHIVED" : existing.status, revisionNote: "Mise à jour" });
        }
      });
    } catch (error) {
      if (error instanceof Error && /duplicate|unique/i.test(error.message)) throw new ActionError({ code: "CONFLICT", message: "Un service avec ce slug existe déjà pour ce tenant/locale." });
      throw error;
    }
    auditService(context, user.id, "SERVICE_UPDATE", { resource: "services", resourceId: input.id, metadata: { organizationId: tenant.organizationId } });
    invalidateServicesCache();
    return { id: input.id };
  },
});
