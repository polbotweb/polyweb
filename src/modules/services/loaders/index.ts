import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Locale } from "@i18n/config";
import { getDrizzle } from "@database/drizzle";
import { serviceCategories, serviceCategoryTranslations, serviceTags, serviceTagTranslations, serviceTranslations, services, serviceCategoryLinks, serviceTagLinks, serviceMedia, serviceAvailability, serviceSeo, serviceRevisions, serviceLocks, mediaFiles, mediaFileAlts, user } from "@database/schemas";
import { serviceListFiltersSchema } from "@/modules/services/validation";
import type { ServiceDetail, ServiceListItem } from "@/modules/services/domain";

const serviceTenantScope = (organizationId: string | null) => organizationId === null ? isNull(services.organizationId) : eq(services.organizationId, organizationId);
const categoryTenantScope = (organizationId: string | null) => organizationId === null ? isNull(serviceCategories.organizationId) : eq(serviceCategories.organizationId, organizationId);
const tagTenantScope = (organizationId: string | null) => organizationId === null ? isNull(serviceTags.organizationId) : eq(serviceTags.organizationId, organizationId);
const mediaTenantScope = (organizationId: string | null) => organizationId === null ? isNull(mediaFiles.organizationId) : eq(mediaFiles.organizationId, organizationId);
const translationTenantScope = (organizationId: string | null) => organizationId === null ? isNull(serviceTranslations.organizationId) : eq(serviceTranslations.organizationId, organizationId);

async function loadServiceDetailById(serviceId: string, locale: Locale, organizationId: string | null, publicOnly: boolean): Promise<ServiceDetail | null> {
  const db = getDrizzle();
  const conditions = [eq(services.id, serviceId), serviceTenantScope(organizationId), eq(serviceTranslations.locale, locale), translationTenantScope(organizationId)];
  if (publicOnly) conditions.push(eq(services.status, "PUBLISHED"));
  const [row] = await db.select({ service: services, translation: serviceTranslations, provider: { id: user.id, name: user.name, image: user.image } }).from(services).innerJoin(serviceTranslations, and(eq(serviceTranslations.serviceId, services.id), eq(serviceTranslations.locale, locale), translationTenantScope(organizationId))).leftJoin(user, eq(user.id, services.providerId)).where(and(...conditions)).limit(1);
  if (!row) return null;

  const [categories, tags, media, availability, seo, translationLocales, revisions, lockRows] = await Promise.all([
    db.select({ id: serviceCategories.id, slug: serviceCategories.slug, localizedSlug: serviceCategoryTranslations.slug, name: serviceCategoryTranslations.name }).from(serviceCategoryLinks).innerJoin(serviceCategories, and(eq(serviceCategories.id, serviceCategoryLinks.categoryId), categoryTenantScope(organizationId))).leftJoin(serviceCategoryTranslations, and(eq(serviceCategoryTranslations.categoryId, serviceCategories.id), eq(serviceCategoryTranslations.locale, locale), organizationId === null ? isNull(serviceCategoryTranslations.organizationId) : eq(serviceCategoryTranslations.organizationId, organizationId))).where(eq(serviceCategoryLinks.serviceId, serviceId)),
    db.select({ id: serviceTags.id, slug: serviceTags.slug, localizedSlug: serviceTagTranslations.slug, name: serviceTagTranslations.name }).from(serviceTagLinks).innerJoin(serviceTags, and(eq(serviceTags.id, serviceTagLinks.tagId), tagTenantScope(organizationId))).leftJoin(serviceTagTranslations, and(eq(serviceTagTranslations.tagId, serviceTags.id), eq(serviceTagTranslations.locale, locale), organizationId === null ? isNull(serviceTagTranslations.organizationId) : eq(serviceTagTranslations.organizationId, organizationId))).where(eq(serviceTagLinks.serviceId, serviceId)),
    db.select({ id: mediaFiles.id, mediaId: serviceMedia.mediaId, kind: serviceMedia.kind, altText: serviceMedia.altText, caption: serviceMedia.caption, sortOrder: serviceMedia.sortOrder }).from(serviceMedia).innerJoin(mediaFiles, and(eq(mediaFiles.id, serviceMedia.mediaId), mediaTenantScope(organizationId))).where(eq(serviceMedia.serviceId, serviceId)).orderBy(asc(serviceMedia.sortOrder)),
    db.select({ id: serviceAvailability.id, dayOfWeek: serviceAvailability.dayOfWeek, startTime: serviceAvailability.startTime, endTime: serviceAvailability.endTime, timezone: serviceAvailability.timezone, maxParticipants: serviceAvailability.maxParticipants }).from(serviceAvailability).where(eq(serviceAvailability.serviceId, serviceId)).orderBy(asc(serviceAvailability.dayOfWeek), asc(serviceAvailability.startTime)),
    db.select({ locale: serviceSeo.locale, focusKeyword: serviceSeo.focusKeyword, metaRobots: serviceSeo.metaRobots, schemaMarkup: serviceSeo.schemaMarkup }).from(serviceSeo).where(and(eq(serviceSeo.serviceId, serviceId), eq(serviceSeo.locale, locale))).limit(1),
    db.select({ locale: serviceTranslations.locale }).from(serviceTranslations).where(and(eq(serviceTranslations.serviceId, serviceId), translationTenantScope(organizationId))),
    publicOnly ? Promise.resolve([] as { id: string; locale: string; title: string; slug: string; status: string; revisionNote: string | null; createdAt: Date }[]) : db.select({ id: serviceRevisions.id, locale: serviceRevisions.locale, title: serviceRevisions.title, slug: serviceRevisions.slug, status: serviceRevisions.status, revisionNote: serviceRevisions.revisionNote, createdAt: serviceRevisions.createdAt }).from(serviceRevisions).where(eq(serviceRevisions.serviceId, serviceId)).orderBy(desc(serviceRevisions.createdAt)).limit(50),
    publicOnly ? Promise.resolve([] as { userId: string; sessionId: string; lockedAt: Date; expiresAt: Date }[]) : db.select({ userId: serviceLocks.userId, sessionId: serviceLocks.sessionId, lockedAt: serviceLocks.lockedAt, expiresAt: serviceLocks.expiresAt }).from(serviceLocks).where(eq(serviceLocks.serviceId, serviceId)).limit(1),
  ]);

  let coverMedia: ServiceListItem["coverMedia"] = null;
  if (row.service.coverImageId) {
    const [cover] = await db.select({ id: mediaFiles.id, url: mediaFiles.url, alt: mediaFileAlts.alt }).from(mediaFiles).leftJoin(mediaFileAlts, and(eq(mediaFileAlts.fileId, mediaFiles.id), eq(mediaFileAlts.locale, locale))).where(and(eq(mediaFiles.id, row.service.coverImageId), mediaTenantScope(organizationId))).limit(1);
    if (cover?.url) coverMedia = { id: cover.id, url: cover.url, alt: cover.alt ?? "" };
  }
  const activeLock = lockRows[0] && lockRows[0].expiresAt > new Date() ? lockRows[0] : null;

  return {
    service: row.service,
    translation: row.translation ? { locale: row.translation.locale, title: row.translation.title, slug: row.translation.slug, excerpt: row.translation.excerpt, content: row.translation.content, locationLabel: row.translation.locationLabel, locationAddress: row.translation.locationAddress, metaTitle: row.translation.metaTitle, metaDescription: row.translation.metaDescription, metaKeywords: row.translation.metaKeywords, canonicalUrl: row.translation.canonicalUrl, ogTitle: row.translation.ogTitle, ogDescription: row.translation.ogDescription, ogImageId: row.translation.ogImageId } : null,
    provider: row.provider,
    categories: categories.map((item) => ({ id: item.id, slug: item.localizedSlug ?? item.slug, name: item.name ?? null })),
    tags: tags.map((item) => ({ id: item.id, slug: item.localizedSlug ?? item.slug, name: item.name ?? null })),
    media,
    coverMedia,
    availability,
    seo: seo[0] ?? null,
    availableLocales: translationLocales.map((item) => item.locale),
    revisions: revisions.map((revision) => ({ ...revision, status: revision.status as import("@/modules/services/domain").ServiceStatus })),
    lock: activeLock,
  };
}

export async function getServices(input: unknown = {}, locale: Locale = "fr", publicOnly = true): Promise<{ items: ServiceListItem[]; page: number; limit: number; total: number; totalPages: number }> {
  const rawInput = typeof input === "object" && input !== null ? input : {};
  const filters = serviceListFiltersSchema.parse({ ...rawInput, locale });
  const organizationId = filters.organizationId ?? null;
  const resolvedLocale = filters.locale ?? locale;
  const db = getDrizzle(); const conditions = [serviceTenantScope(organizationId), eq(serviceTranslations.locale, resolvedLocale), translationTenantScope(organizationId)];
  if (publicOnly) conditions.push(eq(services.status, "PUBLISHED")); else if (filters.status) conditions.push(eq(services.status, filters.status));
  const searchQuery = filters.search ? sql`websearch_to_tsquery("atomic_service_locale_regconfig"(${resolvedLocale}), ${filters.search})` : null;
  if (searchQuery) conditions.push(sql`${serviceTranslations.searchVector} @@ ${searchQuery}`);
  if (filters.providerId) conditions.push(eq(services.providerId, filters.providerId)); if (filters.featured !== undefined) conditions.push(eq(services.isFeatured, filters.featured)); if (filters.mobile !== undefined) conditions.push(eq(services.isMobile, filters.mobile));
  if (filters.categoryId) conditions.push(inArray(services.id, db.select({ serviceId: serviceCategoryLinks.serviceId }).from(serviceCategoryLinks).innerJoin(serviceCategories, and(eq(serviceCategories.id, serviceCategoryLinks.categoryId), categoryTenantScope(organizationId))).where(eq(serviceCategoryLinks.categoryId, filters.categoryId))));
  if (filters.tagId) conditions.push(inArray(services.id, db.select({ serviceId: serviceTagLinks.serviceId }).from(serviceTagLinks).innerJoin(serviceTags, and(eq(serviceTags.id, serviceTagLinks.tagId), tagTenantScope(organizationId))).where(eq(serviceTagLinks.tagId, filters.tagId))));
  const orderColumn = filters.sortBy === "title" ? serviceTranslations.title : filters.sortBy === "priceMinor" ? services.priceMinor : filters.sortBy === "ratingAverage100" ? services.ratingAverage100 : filters.sortBy === "viewCount" ? services.viewCount : filters.sortBy === "publishedAt" ? services.publishedAt : filters.sortBy === "createdAt" ? services.createdAt : services.updatedAt;
  const orderExpression = searchQuery ? desc(sql<number>`ts_rank(${serviceTranslations.searchVector}, ${searchQuery})`) : filters.sortOrder === "asc" ? asc(orderColumn) : desc(orderColumn);
  const [{ totalRow }] = await db.select({ totalRow: sql<number>`count(*)` }).from(services).innerJoin(serviceTranslations, and(eq(serviceTranslations.serviceId, services.id), eq(serviceTranslations.locale, resolvedLocale), translationTenantScope(organizationId))).where(and(...conditions));
  const total = Number(totalRow ?? 0);
  const rows = await db.select({ service: services, translation: serviceTranslations, provider: { id: user.id, name: user.name, image: user.image } }).from(services).innerJoin(serviceTranslations, and(eq(serviceTranslations.serviceId, services.id), eq(serviceTranslations.locale, resolvedLocale), translationTenantScope(organizationId))).leftJoin(user, eq(user.id, services.providerId)).where(and(...conditions)).orderBy(orderExpression, asc(services.id)).limit(filters.limit).offset((filters.page - 1) * filters.limit);
  const ids = rows.map((row) => row.service.id);
  const [categoryRows, coverRows] = await Promise.all([
    ids.length ? db.select({ serviceId: serviceCategoryLinks.serviceId, id: serviceCategories.id, slug: serviceCategories.slug, localizedSlug: serviceCategoryTranslations.slug, name: serviceCategoryTranslations.name }).from(serviceCategoryLinks).innerJoin(serviceCategories, and(eq(serviceCategories.id, serviceCategoryLinks.categoryId), categoryTenantScope(organizationId))).leftJoin(serviceCategoryTranslations, and(eq(serviceCategoryTranslations.categoryId, serviceCategories.id), eq(serviceCategoryTranslations.locale, resolvedLocale), organizationId === null ? isNull(serviceCategoryTranslations.organizationId) : eq(serviceCategoryTranslations.organizationId, organizationId))).where(inArray(serviceCategoryLinks.serviceId, ids)) : [],
    ids.length ? db.select({ serviceId: services.id, mediaId: services.coverImageId, url: mediaFiles.url, alt: mediaFileAlts.alt }).from(services).leftJoin(mediaFiles, and(eq(mediaFiles.id, services.coverImageId), mediaTenantScope(organizationId))).leftJoin(mediaFileAlts, and(eq(mediaFileAlts.fileId, mediaFiles.id), eq(mediaFileAlts.locale, resolvedLocale))).where(inArray(services.id, ids)) : [],
  ]);
  const categories = new Map<string, ServiceListItem["categories"]>(); for (const category of categoryRows) categories.set(category.serviceId, [...(categories.get(category.serviceId) ?? []), { id: category.id, slug: category.localizedSlug ?? category.slug, name: category.name ?? null }]);
  const coverMedia = new Map<string, NonNullable<ServiceListItem["coverMedia"]>>(); for (const cover of coverRows) if (cover.url && cover.mediaId) coverMedia.set(cover.serviceId, { id: cover.mediaId, url: cover.url, alt: cover.alt ?? "" });
  const items: ServiceListItem[] = rows.map(({ service, translation, provider }) => ({ service, translation: translation ? { locale: translation.locale, title: translation.title, slug: translation.slug, excerpt: translation.excerpt, content: translation.content, locationLabel: translation.locationLabel, locationAddress: translation.locationAddress, metaTitle: translation.metaTitle, metaDescription: translation.metaDescription, metaKeywords: translation.metaKeywords, canonicalUrl: translation.canonicalUrl, ogTitle: translation.ogTitle, ogDescription: translation.ogDescription, ogImageId: translation.ogImageId } : null, provider, categories: categories.get(service.id) ?? [], coverMedia: coverMedia.get(service.id) ?? null }));
  return { items, page: filters.page, limit: filters.limit, total, totalPages: Math.max(1, Math.ceil(total / filters.limit)) };
}

export async function getServiceBySlug(slug: string, locale: Locale = "fr", organizationId: string | null = null, categorySlug?: string | null): Promise<ServiceDetail | null> {
  const db = getDrizzle();
  const [row] = await db.select({ serviceId: services.id }).from(serviceTranslations).innerJoin(services, and(eq(services.id, serviceTranslations.serviceId), serviceTenantScope(organizationId), eq(services.status, "PUBLISHED"), translationTenantScope(organizationId))).where(and(eq(serviceTranslations.slug, slug), eq(serviceTranslations.locale, locale), translationTenantScope(organizationId))).limit(1);
  if (!row) return null;
  if (categorySlug) {
    const [membership] = await db.select({ serviceId: serviceCategoryLinks.serviceId }).from(serviceCategoryLinks).innerJoin(serviceCategories, and(eq(serviceCategories.id, serviceCategoryLinks.categoryId), categoryTenantScope(organizationId))).innerJoin(serviceCategoryTranslations, and(eq(serviceCategoryTranslations.categoryId, serviceCategories.id), eq(serviceCategoryTranslations.locale, locale), organizationId === null ? isNull(serviceCategoryTranslations.organizationId) : eq(serviceCategoryTranslations.organizationId, organizationId))).where(and(eq(serviceCategoryLinks.serviceId, row.serviceId), eq(serviceCategoryTranslations.slug, categorySlug))).limit(1);
    if (!membership) return null;
  }
  return loadServiceDetailById(row.serviceId, locale, organizationId, true);
}
export async function getServiceByIdAdmin(id: string, locale: Locale, organizationId: string | null = null): Promise<ServiceDetail | null> { return loadServiceDetailById(id, locale, organizationId, false); }
export async function getServiceCategories(locale: Locale = "fr", organizationId: string | null = null) { return getDrizzle().select({ category: serviceCategories, translation: serviceCategoryTranslations }).from(serviceCategories).leftJoin(serviceCategoryTranslations, and(eq(serviceCategoryTranslations.categoryId, serviceCategories.id), eq(serviceCategoryTranslations.locale, locale), organizationId === null ? isNull(serviceCategoryTranslations.organizationId) : eq(serviceCategoryTranslations.organizationId, organizationId))).where(categoryTenantScope(organizationId)).orderBy(asc(serviceCategories.sortOrder)); }
export async function getServiceTags(locale: Locale = "fr", organizationId: string | null = null) { return getDrizzle().select({ tag: serviceTags, translation: serviceTagTranslations }).from(serviceTags).leftJoin(serviceTagTranslations, and(eq(serviceTagTranslations.tagId, serviceTags.id), eq(serviceTagTranslations.locale, locale), organizationId === null ? isNull(serviceTagTranslations.organizationId) : eq(serviceTagTranslations.organizationId, organizationId))).where(tagTenantScope(organizationId)).orderBy(asc(serviceTags.slug)); }
export async function getServiceProviders(organizationId: string | null = null) { const db = getDrizzle(); return db.selectDistinct({ id: user.id, name: user.name }).from(services).innerJoin(user, eq(user.id, services.providerId)).where(serviceTenantScope(organizationId)).orderBy(asc(user.name)); }
