import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import {
  blogCategories,
  blogCategoryTranslations,
  blogPostCategories,
  blogPostTranslations,
  blogPosts,
  blogPostTags,
  blogTagTranslations,
  blogTags,
  user,
} from "@database/schemas";
import type { Locale } from "@i18n/config";
import type { BlogPostStatus } from "@/lib/blog/constants";

export interface BlogAdminPostFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: BlogPostStatus;
  categoryId?: string;
  tagId?: string;
  authorId?: string;
  featured?: boolean;
  sticky?: boolean;
  translationLocale?: Locale;
  sortBy?: "createdAt" | "updatedAt" | "publishedAt" | "title" | "viewCount";
  sortOrder?: "asc" | "desc";
}

export interface BlogAdminAggregateStats {
  total: number;
  published: number;
  draft: number;
  archived: number;
  deleted: number;
  featured: number;
  sticky: number;
  views: number;
}

function tenantScope(organizationId: string | null) {
  return organizationId === null ? isNull(blogPosts.organizationId) : eq(blogPosts.organizationId, organizationId);
}
function translationTenantScope(organizationId: string | null) {
  return organizationId === null ? isNull(blogPostTranslations.organizationId) : eq(blogPostTranslations.organizationId, organizationId);
}
function categoryTenantScope(organizationId: string | null) {
  return organizationId === null ? isNull(blogCategories.organizationId) : eq(blogCategories.organizationId, organizationId);
}
function tagTenantScope(organizationId: string | null) {
  return organizationId === null ? isNull(blogTags.organizationId) : eq(blogTags.organizationId, organizationId);
}

export async function getBlogAdminPostData(organizationId: string | null, locale: Locale, filters: BlogAdminPostFilters = {}) {
  const db = getDrizzle();
  const displayLocale = filters.translationLocale ?? locale;
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const offset = (page - 1) * limit;
  const conditions = [tenantScope(organizationId), eq(blogPostTranslations.locale, displayLocale), translationTenantScope(organizationId)];

  if (filters.status) conditions.push(eq(blogPosts.status, filters.status));
  if (filters.authorId) conditions.push(eq(blogPosts.authorId, filters.authorId));
  if (filters.featured !== undefined) conditions.push(eq(blogPosts.isFeatured, filters.featured));
  if (filters.sticky !== undefined) conditions.push(eq(blogPosts.isSticky, filters.sticky));
  if (filters.search?.trim()) {
    const query = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(blogPostTranslations.title, query), ilike(blogPostTranslations.slug, query))!);
  }
  if (filters.categoryId) {
    conditions.push(inArray(blogPosts.id, db.select({ postId: blogPostCategories.postId }).from(blogPostCategories).innerJoin(blogCategories, eq(blogCategories.id, blogPostCategories.categoryId)).where(and(eq(blogPostCategories.categoryId, filters.categoryId), categoryTenantScope(organizationId)))));
  }
  if (filters.tagId) {
    conditions.push(inArray(blogPosts.id, db.select({ postId: blogPostTags.postId }).from(blogPostTags).innerJoin(blogTags, eq(blogTags.id, blogPostTags.tagId)).where(and(eq(blogPostTags.tagId, filters.tagId), tagTenantScope(organizationId)))));
  }

  const orderDirection = filters.sortOrder === "asc" ? asc : desc;
  const orderBy = (() => {
    switch (filters.sortBy) {
      case "title": return orderDirection(blogPostTranslations.title);
      case "viewCount": return orderDirection(blogPosts.viewCount);
      case "publishedAt": return orderDirection(blogPosts.publishedAt);
      case "createdAt": return orderDirection(blogPosts.createdAt);
      case "updatedAt":
      default: return orderDirection(blogPosts.updatedAt);
    }
  })();

  const rows = await db
    .select({ post: blogPosts, translation: { id: blogPostTranslations.id, title: blogPostTranslations.title, slug: blogPostTranslations.slug, locale: blogPostTranslations.locale }, author: { id: user.id, name: user.name, image: user.image } })
    .from(blogPosts)
    .innerJoin(blogPostTranslations, and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, displayLocale), translationTenantScope(organizationId)))
    .leftJoin(user, eq(user.id, blogPosts.authorId))
    .where(and(...conditions))
    .orderBy(orderBy, desc(blogPosts.id))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(blogPosts).innerJoin(blogPostTranslations, and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, displayLocale), translationTenantScope(organizationId))).where(and(...conditions));

  const postIds = rows.map(({ post }) => post.id);
  const categoryRows = postIds.length === 0 ? [] : await db
    .select({ postId: blogPostCategories.postId, id: blogCategories.id, slug: sql<string>`coalesce(${blogCategoryTranslations.slug}, ${blogCategories.slug})`, name: sql<string>`coalesce(${blogCategoryTranslations.name}, ${blogCategories.slug})` })
    .from(blogPostCategories)
    .innerJoin(blogCategories, eq(blogCategories.id, blogPostCategories.categoryId))
    .leftJoin(blogCategoryTranslations, and(eq(blogCategoryTranslations.categoryId, blogCategories.id), eq(blogCategoryTranslations.locale, displayLocale)))
    .where(and(inArray(blogPostCategories.postId, postIds), categoryTenantScope(organizationId)))
    .orderBy(asc(blogCategories.sortOrder), asc(blogCategories.id));
  const categoriesByPost = new Map<string, typeof categoryRows>();
  for (const category of categoryRows) {
    const list = categoriesByPost.get(category.postId);
    if (list) list.push(category); else categoriesByPost.set(category.postId, [category]);
  }

  const items = rows.map((row) => ({ ...row, categories: (categoriesByPost.get(row.post.id) ?? []).map((category) => ({ id: category.id, slug: category.slug, name: category.name })) }));

  const [{ total: aggregateTotal }] = await db.select({ total: count() }).from(blogPosts).where(tenantScope(organizationId));
  const statusRows = await db.select({ status: blogPosts.status, count: count() }).from(blogPosts).where(tenantScope(organizationId)).groupBy(blogPosts.status);
  const [{ views }] = await db.select({ views: sql<number>`coalesce(sum(${blogPosts.viewCount}), 0)` }).from(blogPosts).where(tenantScope(organizationId));
  const [{ featured }] = await db.select({ featured: count() }).from(blogPosts).where(and(tenantScope(organizationId), eq(blogPosts.isFeatured, true)));
  const [{ sticky }] = await db.select({ sticky: count() }).from(blogPosts).where(and(tenantScope(organizationId), eq(blogPosts.isSticky, true)));
  const stats: BlogAdminAggregateStats = {
    total: Number(aggregateTotal),
    published: Number(statusRows.find((row) => row.status === "PUBLISHED")?.count ?? 0),
    draft: Number(statusRows.find((row) => row.status === "DRAFT")?.count ?? 0),
    archived: Number(statusRows.find((row) => row.status === "ARCHIVED")?.count ?? 0),
    deleted: Number(statusRows.find((row) => row.status === "DELETED")?.count ?? 0),
    featured: Number(featured),
    sticky: Number(sticky),
    views: Number(views),
  };

  return { rows: items, meta: { total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit), hasNextPage: offset + limit < Number(total), hasPrevPage: page > 1 }, stats };
}

export async function getBlogAdminAuthors(organizationId: string | null) {
  const db = getDrizzle();
  return db.selectDistinct({ id: user.id, name: user.name }).from(user).innerJoin(blogPosts, eq(blogPosts.authorId, user.id)).where(tenantScope(organizationId)).orderBy(asc(user.name));
}

export async function getBlogAdminTags(organizationId: string | null, locale: Locale) {
  const db = getDrizzle();
  return db.select({ id: blogTags.id, slug: blogTags.slug, name: sql<string>`coalesce(${blogTagTranslations.name}, ${blogTags.slug})` }).from(blogTags).leftJoin(blogTagTranslations, and(eq(blogTagTranslations.tagId, blogTags.id), eq(blogTagTranslations.locale, locale))).where(tagTenantScope(organizationId)).orderBy(asc(sql<string>`coalesce(${blogTagTranslations.name}, ${blogTags.slug})`));
}
