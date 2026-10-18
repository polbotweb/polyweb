import { and, asc, count, desc, eq, inArray, isNull, sql, sum } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { mediaFileAlts, mediaFiles, serviceAvailability, serviceCategories, serviceCategoryLinks, serviceCategoryTranslations, serviceComments, serviceMedia, serviceReports, serviceRevisions, serviceReviews, serviceSeo, serviceTagLinks, serviceTagTranslations, serviceTags, serviceTranslations, services, serviceLocks, user } from "@database/schemas";
import type { Locale } from "@i18n/config";
import type { ServiceDetail, ServiceListItem } from "@/modules/services/domain";
import { serviceAdminFiltersSchema, type ServiceAdminFilters } from "@/modules/services/validation";
export type { ServiceAdminFilters } from "@/modules/services/validation";

function tenantScope(column: AnyPgColumn<{ data: string | null }>, organizationId: string | null) { return organizationId === null ? isNull(column) : eq(column, organizationId); }
function tenantJoinScope(column: AnyPgColumn<{ data: string | null }>, organizationId: string | null) { return organizationId === null ? isNull(column) : eq(column, organizationId); }

export async function getServiceAdminData(organizationId: string | null, locale: Locale, input: Partial<ServiceAdminFilters> = {}): Promise<{ items: ServiceListItem[]; page: number; limit: number; total: number; totalPages: number }> {
  const filters = serviceAdminFiltersSchema.parse({ ...input, organizationId, locale: input.locale ?? locale });
  const queryLocale = filters.locale ?? locale;
  const db = getDrizzle();
  const conditions = [tenantScope(services.organizationId, organizationId)];
  if (filters.status) conditions.push(eq(services.status, filters.status));
  if (filters.providerId || filters.authorId) conditions.push(eq(services.providerId, filters.providerId ?? filters.authorId!));
  if (filters.categoryId) conditions.push(inArray(services.id, db.select({ serviceId: serviceCategoryLinks.serviceId }).from(serviceCategoryLinks).innerJoin(serviceCategories, and(eq(serviceCategories.id, serviceCategoryLinks.categoryId), tenantScope(serviceCategories.organizationId, organizationId))).where(eq(serviceCategoryLinks.categoryId, filters.categoryId))));
  if (filters.tagId) conditions.push(inArray(services.id, db.select({ serviceId: serviceTagLinks.serviceId }).from(serviceTagLinks).innerJoin(serviceTags, and(eq(serviceTags.id, serviceTagLinks.tagId), tenantScope(serviceTags.organizationId, organizationId))).where(eq(serviceTagLinks.tagId, filters.tagId))));
  if (filters.featured !== undefined) conditions.push(eq(services.isFeatured, filters.featured));
  if (filters.mobile !== undefined) conditions.push(eq(services.isMobile, filters.mobile));
  const translatedConditions = [eq(serviceTranslations.locale, queryLocale), tenantJoinScope(serviceTranslations.organizationId, organizationId)];
  const searchCondition = filters.search ? sql`(${serviceTranslations.searchVector} @@ websearch_to_tsquery(locale_to_regconfig(${queryLocale}), ${filters.search}) OR services.slug ILIKE ${`%${filters.search}%`} OR serviceTranslations.slug ILIKE ${`%${filters.search}%`})` : null;
  if (searchCondition) conditions.push(searchCondition);
  const orderColumn = filters.sortBy === "title" ? serviceTranslations.title : filters.sortBy === "priceMinor" ? services.priceMinor : filters.sortBy === "ratingAverage100" ? services.ratingAverage100 : filters.sortBy === "viewCount" ? services.viewCount : filters.sortBy === "publishedAt" ? services.publishedAt : filters.sortBy === "createdAt" ? services.createdAt : services.updatedAt;
  const orderBy = filters.sortOrder === "asc" ? asc(orderColumn) : desc(orderColumn);
  const [{ totalRow }] = await db.select({ totalRow: count() }).from(services).leftJoin(serviceTranslations, and(eq(serviceTranslations.serviceId, services.id), ...translatedConditions)).where(and(...conditions));
  const total = Number(totalRow ?? 0);
  const rows = await db.select({ service: services, translation: serviceTranslations, provider: { id: user.id, name: user.name, image: user.image } }).from(services).leftJoin(serviceTranslations, and(eq(serviceTranslations.serviceId, services.id), ...translatedConditions)).leftJoin(user, eq(user.id, services.providerId)).where(and(...conditions)).orderBy(orderBy, asc(services.id)).limit(filters.limit).offset((filters.page - 1) * filters.limit);
  const ids = rows.map(({ service }) => service.id);
  const [categoryRows, tagRows, mediaRows] = await Promise.all([
    ids.length ? db.select({ serviceId: serviceCategoryLinks.serviceId, id: serviceCategories.id, slug: serviceCategories.slug, name: serviceCategoryTranslations.name }).from(serviceCategoryLinks).innerJoin(serviceCategories, and(eq(serviceCategories.id, serviceCategoryLinks.categoryId), tenantScope(serviceCategories.organizationId, organizationId))).leftJoin(serviceCategoryTranslations, and(eq(serviceCategoryTranslations.categoryId, serviceCategories.id), eq(serviceCategoryTranslations.locale, queryLocale), tenantJoinScope(serviceCategoryTranslations.organizationId, organizationId))).where(inArray(serviceCategoryLinks.serviceId, ids)) : [],
    ids.length ? db.select({ serviceId: serviceTagLinks.serviceId, id: serviceTags.id, slug: serviceTags.slug, name: serviceTagTranslations.name }).from(serviceTagLinks).innerJoin(serviceTags, and(eq(serviceTags.id, serviceTagLinks.tagId), tenantScope(serviceTags.organizationId, organizationId))).leftJoin(serviceTagTranslations, and(eq(serviceTagTranslations.tagId, serviceTags.id), eq(serviceTagTranslations.locale, queryLocale), tenantJoinScope(serviceTagTranslations.organizationId, organizationId))).where(inArray(serviceTagLinks.serviceId, ids)) : [],
    ids.length ? db.select({ serviceId: services.id, mediaId: services.coverImageId, url: mediaFiles.url, alt: mediaFileAlts.alt }).from(services).leftJoin(mediaFiles, and(eq(mediaFiles.id, services.coverImageId), tenantScope(mediaFiles.organizationId, organizationId))).leftJoin(mediaFileAlts, and(eq(mediaFileAlts.fileId, mediaFiles.id), eq(mediaFileAlts.locale, queryLocale))).where(inArray(services.id, ids)) : [],
  ]);
  const categoriesByService = new Map<string, ServiceListItem["categories"]>(); for (const row of categoryRows) categoriesByService.set(row.serviceId, [...(categoriesByService.get(row.serviceId) ?? []), { id: row.id, slug: row.slug, name: row.name ?? null }]);
  const coverByService = new Map<string, ServiceListItem["coverMedia"]>(); for (const row of mediaRows) if (row.mediaId && row.url) coverByService.set(row.serviceId, { id: row.mediaId, url: row.url, alt: row.alt ?? "" });
  const items = rows.map(({ service, translation, provider }): ServiceListItem => ({ service, translation: translation ? { locale: translation.locale, title: translation.title, slug: translation.slug, excerpt: translation.excerpt, content: translation.content, locationLabel: translation.locationLabel, locationAddress: translation.locationAddress, metaTitle: translation.metaTitle, metaDescription: translation.metaDescription, metaKeywords: translation.metaKeywords, canonicalUrl: translation.canonicalUrl, ogTitle: translation.ogTitle, ogDescription: translation.ogDescription, ogImageId: translation.ogImageId } : null, provider, categories: categoriesByService.get(service.id) ?? [], coverMedia: coverByService.get(service.id) ?? null }));
  return { items, page: filters.page, limit: filters.limit, total, totalPages: Math.max(1, Math.ceil(total / filters.limit)) };
}

export async function getServiceAdminById(id: string, locale: Locale, organizationId: string | null): Promise<ServiceDetail | null> {
  const db = getDrizzle();
  const tenant = tenantScope(services.organizationId, organizationId);
  const translationScope = tenantJoinScope(serviceTranslations.organizationId, organizationId);
  const [row] = await db.select({ service: services, translation: serviceTranslations, provider: { id: user.id, name: user.name, image: user.image } }).from(services).leftJoin(serviceTranslations, and(eq(serviceTranslations.serviceId, services.id), eq(serviceTranslations.locale, locale), translationScope)).leftJoin(user, eq(user.id, services.providerId)).where(and(eq(services.id, id), tenant)).limit(1);
  if (!row) return null;
  const [categories, tags, media, availability, seo, locales, revisions, lockRows] = await Promise.all([
    db.select({ id: serviceCategories.id, slug: serviceCategories.slug, name: serviceCategoryTranslations.name }).from(serviceCategoryLinks).innerJoin(serviceCategories, and(eq(serviceCategories.id, serviceCategoryLinks.categoryId), tenantScope(serviceCategories.organizationId, organizationId))).leftJoin(serviceCategoryTranslations, and(eq(serviceCategoryTranslations.categoryId, serviceCategories.id), eq(serviceCategoryTranslations.locale, locale), tenantJoinScope(serviceCategoryTranslations.organizationId, organizationId))).where(eq(serviceCategoryLinks.serviceId, id)),
    db.select({ id: serviceTags.id, slug: serviceTags.slug, name: serviceTagTranslations.name }).from(serviceTagLinks).innerJoin(serviceTags, and(eq(serviceTags.id, serviceTagLinks.tagId), tenantScope(serviceTags.organizationId, organizationId))).leftJoin(serviceTagTranslations, and(eq(serviceTagTranslations.tagId, serviceTags.id), eq(serviceTagTranslations.locale, locale), tenantJoinScope(serviceTagTranslations.organizationId, organizationId))).where(eq(serviceTagLinks.serviceId, id)),
    db.select({ id: mediaFiles.id, mediaId: serviceMedia.mediaId, kind: serviceMedia.kind, altText: serviceMedia.altText, caption: serviceMedia.caption, sortOrder: serviceMedia.sortOrder }).from(serviceMedia).innerJoin(mediaFiles, and(eq(mediaFiles.id, serviceMedia.mediaId), tenantScope(mediaFiles.organizationId, organizationId))).where(eq(serviceMedia.serviceId, id)).orderBy(asc(serviceMedia.sortOrder)),
    db.select({ id: serviceAvailability.id, dayOfWeek: serviceAvailability.dayOfWeek, startTime: serviceAvailability.startTime, endTime: serviceAvailability.endTime, timezone: serviceAvailability.timezone, maxParticipants: serviceAvailability.maxParticipants }).from(serviceAvailability).where(eq(serviceAvailability.serviceId, id)).orderBy(asc(serviceAvailability.dayOfWeek), asc(serviceAvailability.startTime)),
    db.select({ locale: serviceSeo.locale, focusKeyword: serviceSeo.focusKeyword, metaRobots: serviceSeo.metaRobots, schemaMarkup: serviceSeo.schemaMarkup }).from(serviceSeo).where(and(eq(serviceSeo.serviceId, id), eq(serviceSeo.locale, locale))).limit(1),
    db.select({ locale: serviceTranslations.locale }).from(serviceTranslations).where(and(eq(serviceTranslations.serviceId, id), translationScope)),
    db.select({ id: serviceRevisions.id, locale: serviceRevisions.locale, title: serviceRevisions.title, slug: serviceRevisions.slug, status: serviceRevisions.status, revisionNote: serviceRevisions.revisionNote, createdAt: serviceRevisions.createdAt }).from(serviceRevisions).where(eq(serviceRevisions.serviceId, id)).orderBy(desc(serviceRevisions.createdAt)).limit(50),
    db.select({ userId: serviceLocks.userId, sessionId: serviceLocks.sessionId, lockedAt: serviceLocks.lockedAt, expiresAt: serviceLocks.expiresAt }).from(serviceLocks).where(eq(serviceLocks.serviceId, id)).limit(1),
  ]);
  return { service: row.service, translation: row.translation ? { locale: row.translation.locale, title: row.translation.title, slug: row.translation.slug, excerpt: row.translation.excerpt, content: row.translation.content, locationLabel: row.translation.locationLabel, locationAddress: row.translation.locationAddress, metaTitle: row.translation.metaTitle, metaDescription: row.translation.metaDescription, metaKeywords: row.translation.metaKeywords, canonicalUrl: row.translation.canonicalUrl, ogTitle: row.translation.ogTitle, ogDescription: row.translation.ogDescription, ogImageId: row.translation.ogImageId } : null, provider: row.provider, coverMedia: null, categories: categories.map((item) => ({ id: item.id, slug: item.slug, name: item.name ?? null })), tags: tags.map((item) => ({ id: item.id, slug: item.slug, name: item.name ?? null })), media, availability, seo: seo[0] ?? null, availableLocales: locales.map((item) => item.locale), revisions, lock: lockRows[0] && lockRows[0].expiresAt > new Date() ? lockRows[0] : null };
}

export async function getServiceAdminStats(organizationId: string | null) {
  const db = getDrizzle(); const scope = tenantScope(services.organizationId, organizationId);
  const [total, published, draft, archived, deleted, featured, views, reviews, comments, pendingReviews, pendingComments, pendingDirectReports, pendingCommentReports, pendingReviewReports] = await Promise.all([
    db.select({ count: count() }).from(services).where(scope),
    db.select({ count: count() }).from(services).where(and(scope, eq(services.status, "PUBLISHED"))),
    db.select({ count: count() }).from(services).where(and(scope, eq(services.status, "DRAFT"))),
    db.select({ count: count() }).from(services).where(and(scope, eq(services.status, "ARCHIVED"))),
    db.select({ count: count() }).from(services).where(and(scope, eq(services.status, "DELETED"))),
    db.select({ count: count() }).from(services).where(and(scope, eq(services.isFeatured, true))),
    db.select({ total: sum(services.viewCount) }).from(services).where(scope),
    db.select({ count: count() }).from(serviceReviews).innerJoin(services, eq(services.id, serviceReviews.serviceId)).where(and(scope, eq(serviceReviews.status, "APPROVED"))),
    db.select({ count: count() }).from(serviceComments).innerJoin(services, eq(services.id, serviceComments.serviceId)).where(and(scope, eq(serviceComments.status, "APPROVED"))),
    db.select({ count: count() }).from(serviceReviews).innerJoin(services, eq(services.id, serviceReviews.serviceId)).where(and(scope, eq(serviceReviews.status, "PENDING"))),
    db.select({ count: count() }).from(serviceComments).innerJoin(services, eq(services.id, serviceComments.serviceId)).where(and(scope, eq(serviceComments.status, "PENDING"))),
    db.select({ count: count() }).from(serviceReports).innerJoin(services, eq(services.id, serviceReports.serviceId)).where(and(scope, eq(serviceReports.status, "PENDING"))),
    db.select({ count: count() }).from(serviceReports).innerJoin(serviceComments, eq(serviceComments.id, serviceReports.commentId)).innerJoin(services, eq(services.id, serviceComments.serviceId)).where(and(scope, eq(serviceReports.status, "PENDING"))),
    db.select({ count: count() }).from(serviceReports).innerJoin(serviceReviews, eq(serviceReviews.id, serviceReports.reviewId)).innerJoin(services, eq(services.id, serviceReviews.serviceId)).where(and(scope, eq(serviceReports.status, "PENDING"))),
  ]);
  return {
    total: Number(total[0]?.count ?? 0), published: Number(published[0]?.count ?? 0), draft: Number(draft[0]?.count ?? 0), archived: Number(archived[0]?.count ?? 0), deleted: Number(deleted[0]?.count ?? 0), featured: Number(featured[0]?.count ?? 0), views: Number(views[0]?.total ?? 0), reviews: Number(reviews[0]?.count ?? 0), comments: Number(comments[0]?.count ?? 0), moderation: Number(pendingReviews[0]?.count ?? 0) + Number(pendingComments[0]?.count ?? 0) + Number(pendingDirectReports[0]?.count ?? 0) + Number(pendingCommentReports[0]?.count ?? 0) + Number(pendingReviewReports[0]?.count ?? 0),
  };
}

export async function getServiceAdminTaxonomy(organizationId: string | null, locale: Locale) {
  const db = getDrizzle(); const categoryTranslationScope = tenantJoinScope(serviceCategoryTranslations.organizationId, organizationId); const tagTranslationScope = tenantJoinScope(serviceTagTranslations.organizationId, organizationId);
  const [categories, tags] = await Promise.all([
    db.select({ category: serviceCategories, translation: serviceCategoryTranslations }).from(serviceCategories).leftJoin(serviceCategoryTranslations, and(eq(serviceCategoryTranslations.categoryId, serviceCategories.id), eq(serviceCategoryTranslations.locale, locale), categoryTranslationScope)).where(tenantScope(serviceCategories.organizationId, organizationId)).orderBy(asc(serviceCategories.sortOrder)),
    db.select({ tag: serviceTags, translation: serviceTagTranslations }).from(serviceTags).leftJoin(serviceTagTranslations, and(eq(serviceTagTranslations.tagId, serviceTags.id), eq(serviceTagTranslations.locale, locale), tagTranslationScope)).where(tenantScope(serviceTags.organizationId, organizationId)).orderBy(asc(serviceTags.slug)),
  ]);
  return { categories, tags };
}

export async function getServiceModerationQueue(organizationId: string | null) {
  const db = getDrizzle(); const scope = tenantScope(services.organizationId, organizationId);
  const [reviews, comments, directReports, commentReports, reviewReports] = await Promise.all([
    db.select({ review: serviceReviews }).from(serviceReviews).innerJoin(services, eq(services.id, serviceReviews.serviceId)).where(and(scope, eq(serviceReviews.status, "PENDING"))).orderBy(asc(serviceReviews.createdAt)).limit(100),
    db.select({ comment: serviceComments }).from(serviceComments).innerJoin(services, eq(services.id, serviceComments.serviceId)).where(and(scope, eq(serviceComments.status, "PENDING"))).orderBy(asc(serviceComments.createdAt)).limit(100),
    db.select({ report: serviceReports, serviceId: services.id }).from(serviceReports).innerJoin(services, eq(services.id, serviceReports.serviceId)).where(and(scope, eq(serviceReports.status, "PENDING"))).orderBy(asc(serviceReports.createdAt)).limit(100),
    db.select({ report: serviceReports, serviceId: serviceComments.serviceId }).from(serviceReports).innerJoin(serviceComments, eq(serviceComments.id, serviceReports.commentId)).innerJoin(services, eq(services.id, serviceComments.serviceId)).where(and(scope, eq(serviceReports.status, "PENDING"))).orderBy(asc(serviceReports.createdAt)).limit(100),
    db.select({ report: serviceReports, serviceId: serviceReviews.serviceId }).from(serviceReports).innerJoin(serviceReviews, eq(serviceReviews.id, serviceReports.reviewId)).innerJoin(services, eq(services.id, serviceReviews.serviceId)).where(and(scope, eq(serviceReviews.status, "PENDING"))).orderBy(asc(serviceReports.createdAt)).limit(100),
  ]);
  const reports = [...directReports, ...commentReports, ...reviewReports].sort((a, b) => a.report.createdAt.getTime() - b.report.createdAt.getTime()).slice(0, 100);
  return { reviews, comments, reports };
}
