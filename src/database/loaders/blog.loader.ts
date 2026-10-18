import { eq, and, desc, asc, or, ilike, inArray, isNull, sql, count, gte } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { cached } from "@database/cache";
import {
  blogPosts,
  blogPostTranslations,
  blogCategories,
  blogCategoryTranslations,
  blogTags,
  blogTagTranslations,
  blogPostCategories,
  blogPostTags,
  blogComments,
  blogPostRevisions,
  blogPostGalleries,
  blogPostGalleryMedia,
  blogPostReviews,
  blogPostReviewHelpful,
  blogReports,
  blogPostReactions,
  blogPostSeo,
  blogPostViewStats,
  blogNotifications,
  blogPostLocks,
  blogPostLinks,
  mediaFiles,
  user,
} from "@database/schemas";
import { type Locale } from "@i18n/config";
import { isValidLocale } from "@i18n/utils";
import type {
  BlogCategory,
  BlogCategoryTranslation,
  BlogPostFilters,
  BlogPaginationMeta,
  BlogPostListItem,
  BlogTag,
  BlogTagTranslation,
} from "@/lib/blog/types";
import { BLOG_DEFAULTS, type BlogPostStatus, type BlogReactionType } from "@/lib/blog/constants";
import { publicBlogPostScope } from "@/lib/blog/public-visibility";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function orgScope(
  table: typeof blogPosts | typeof blogCategories | typeof blogTags,
  organizationId: string | null,
) {
  return organizationId === null
    ? isNull(table.organizationId)
    : eq(table.organizationId, organizationId);
}

export function publishedScope(table: typeof blogPosts) {
  return publicBlogPostScope(table);
}

type BlogPostListRow = {
  post: typeof blogPosts.$inferSelect;
  translation: typeof blogPostTranslations.$inferSelect | null;
  author: { id: string; name: string; image: string | null } | null;
  featuredImage: { id: string; url: string } | null;
};

async function hydrateBlogPostListItems(
  rows: BlogPostListRow[],
  locale: Locale,
): Promise<BlogPostListItem[]> {
  if (rows.length === 0) return [];

  const db = getDrizzle();
  const postIds = rows.map((row) => row.post.id);

  // Batched across the whole page (5 fixed queries) instead of 5 queries PER
  // post row — avoids an N+1 pattern on listing pages. SQL-level ORDER BY is
  // still correct per-post after grouping in JS: a stable multi-key sort over
  // category attributes preserves each post's relative order once filtered.
  const [categoryRows, tagRows, commentRows, reviewRows, reactionRows] = await Promise.all([
    db
      .select({
        postId: blogPostCategories.postId,
        id: blogCategories.id,
        slug: sql<string>`coalesce(${blogCategoryTranslations.slug}, ${blogCategories.slug})`,
        name: blogCategoryTranslations.name,
      })
      .from(blogPostCategories)
      .innerJoin(blogCategories, eq(blogPostCategories.categoryId, blogCategories.id))
      .leftJoin(
        blogCategoryTranslations,
        and(
          eq(blogCategoryTranslations.categoryId, blogCategories.id),
          eq(blogCategoryTranslations.locale, locale),
        ),
      )
      .where(inArray(blogPostCategories.postId, postIds))
      .orderBy(
        asc(blogCategories.sortOrder),
        asc(sql<string>`coalesce(${blogCategoryTranslations.slug}, ${blogCategories.slug})`),
        asc(blogCategories.id),
      ),
    db
      .select({
        postId: blogPostTags.postId,
        id: blogTags.id,
        slug: sql<string>`coalesce(${blogTagTranslations.slug}, ${blogTags.slug})`,
        name: blogTagTranslations.name,
      })
      .from(blogPostTags)
      .innerJoin(blogTags, eq(blogPostTags.tagId, blogTags.id))
      .leftJoin(
        blogTagTranslations,
        and(eq(blogTagTranslations.tagId, blogTags.id), eq(blogTagTranslations.locale, locale)),
      )
      .where(inArray(blogPostTags.postId, postIds)),
    db
      .select({ postId: blogComments.postId, value: count() })
      .from(blogComments)
      .where(and(inArray(blogComments.postId, postIds), eq(blogComments.status, "APPROVED")))
      .groupBy(blogComments.postId),
    db
      .select({
        postId: blogPostReviews.postId,
        avgRating: sql<string>`avg(${blogPostReviews.rating})`,
        reviewCount: count(),
      })
      .from(blogPostReviews)
      .where(and(inArray(blogPostReviews.postId, postIds), eq(blogPostReviews.status, "APPROVED")))
      .groupBy(blogPostReviews.postId),
    db
      .select({
        postId: blogPostReactions.postId,
        reactionType: blogPostReactions.reactionType,
        value: count(),
      })
      .from(blogPostReactions)
      .where(inArray(blogPostReactions.postId, postIds))
      .groupBy(blogPostReactions.postId, blogPostReactions.reactionType),
  ]);

  const categoriesByPost = new Map<string, typeof categoryRows>();
  for (const row of categoryRows) {
    const list = categoriesByPost.get(row.postId);
    if (list) list.push(row);
    else categoriesByPost.set(row.postId, [row]);
  }

  const tagsByPost = new Map<string, typeof tagRows>();
  for (const row of tagRows) {
    const list = tagsByPost.get(row.postId);
    if (list) list.push(row);
    else tagsByPost.set(row.postId, [row]);
  }

  const commentCountByPost = new Map(commentRows.map((row) => [row.postId, Number(row.value)]));
  const reviewAggByPost = new Map(
    reviewRows.map((row) => [
      row.postId,
      { rating: row.avgRating != null ? parseFloat(row.avgRating) : null, reviewCount: Number(row.reviewCount) },
    ]),
  );

  const emptyReactionCounts = (): Record<BlogReactionType, number> => ({
    LIKE: 0,
    LOVE: 0,
    FIRE: 0,
    CLAP: 0,
    LAUGH: 0,
    SAD: 0,
  });

  const reactionsByPost = new Map<string, Record<BlogReactionType, number>>();
  for (const row of reactionRows) {
    const existing = reactionsByPost.get(row.postId) ?? emptyReactionCounts();
    existing[row.reactionType as BlogReactionType] = Number(row.value);
    reactionsByPost.set(row.postId, existing);
  }

  return rows.map((row) => {
    const categories = categoriesByPost.get(row.post.id) ?? [];
    const tags = tagsByPost.get(row.post.id) ?? [];
    const reviewAgg = reviewAggByPost.get(row.post.id);

    return {
      ...row,
      categories: categories.map((category) => ({
        id: category.id,
        slug: category.slug,
        name: category.name ?? category.slug,
      })),
      tags: tags.map((tag) => ({
        id: tag.id,
        slug: tag.slug,
        name: tag.name ?? tag.slug,
      })),
      commentCount: commentCountByPost.get(row.post.id) ?? 0,
      reactionCounts: reactionsByPost.get(row.post.id) ?? emptyReactionCounts(),
      rating: reviewAgg?.rating ?? null,
      reviewCount: reviewAgg?.reviewCount ?? 0,
    };
  });
}


// ─── Posts ───────────────────────────────────────────────────────────────────

export const getBlogPostBySlug = cached(
  (organizationId: string | null, locale: Locale, slug: string) =>
    `blog:post:${organizationId ?? "global"}:${locale}:${slug}`,
  async (
    organizationId: string | null,
    locale: Locale,
    slug: string,
  ) => {
    if (!isValidLocale(locale)) return null;
    const db = getDrizzle();

    const [row] = await db
      .select({
        post: blogPosts,
        translation: blogPostTranslations,
      })
      .from(blogPostTranslations)
      .innerJoin(blogPosts, eq(blogPosts.id, blogPostTranslations.postId))
      .where(
        and(
          eq(blogPostTranslations.locale, locale),
          eq(blogPostTranslations.slug, slug),
          orgScope(blogPosts, organizationId),
          publicBlogPostScope(blogPosts),
        ),
      )
      .limit(1);

    if (!row) return null;
    const { post, translation } = row;

    const author = post.authorId
      ? await db.select({ id: user.id, name: user.name, image: user.image }).from(user).where(eq(user.id, post.authorId)).limit(1).then(r => r[0] ?? null)
      : null;

    const featuredImage = post.featuredImageId
      ? await db.select({ id: mediaFiles.id, url: mediaFiles.url, width: mediaFiles.width, height: mediaFiles.height }).from(mediaFiles).where(eq(mediaFiles.id, post.featuredImageId)).limit(1).then(r => r[0] ?? null)
      : null;

    const ogImage = translation.ogImageId
      ? await db.select({ id: mediaFiles.id, url: mediaFiles.url }).from(mediaFiles).where(eq(mediaFiles.id, translation.ogImageId)).limit(1).then(r => r[0] ?? null)
      : null;

    const categories = await db
      .select({
        id: blogCategories.id,
        slug: sql<string>`coalesce(${blogCategoryTranslations.slug}, ${blogCategories.slug})`,
        color: blogCategories.color,
        name: blogCategoryTranslations.name,
      })
      .from(blogPostCategories)
      .innerJoin(blogCategories, eq(blogPostCategories.categoryId, blogCategories.id))
      .leftJoin(
        blogCategoryTranslations,
        and(
          eq(blogCategoryTranslations.categoryId, blogCategories.id),
          eq(blogCategoryTranslations.locale, locale),
        ),
      )
      .where(eq(blogPostCategories.postId, post.id))
      .orderBy(
        asc(blogCategories.sortOrder),
        asc(sql<string>`coalesce(${blogCategoryTranslations.slug}, ${blogCategories.slug})`),
        asc(blogCategories.id),
      );

    const tags = await db
      .select({
        id: blogTags.id,
        slug: sql<string>`coalesce(${blogTagTranslations.slug}, ${blogTags.slug})`,
        color: blogTags.color,
        name: blogTagTranslations.name,
      })
      .from(blogPostTags)
      .innerJoin(blogTags, eq(blogPostTags.tagId, blogTags.id))
      .leftJoin(
        blogTagTranslations,
        and(eq(blogTagTranslations.tagId, blogTags.id), eq(blogTagTranslations.locale, locale)),
      )
      .where(eq(blogPostTags.postId, post.id));

    const galleries = await db
      .select()
      .from(blogPostGalleries)
      .where(eq(blogPostGalleries.postId, post.id))
      .orderBy(asc(blogPostGalleries.sortOrder));

    const galleriesWithMedia = await (async () => {
      const mediaByGallery = await getBlogGalleriesWithMedia(galleries.map((g) => g.id));
      return galleries.map((gallery) => ({ ...gallery, media: mediaByGallery.get(gallery.id) ?? [] }));
    })();

    const seo = await db
      .select()
      .from(blogPostSeo)
      .where(and(eq(blogPostSeo.postId, post.id), eq(blogPostSeo.locale, locale)))
      .limit(1)
      .then(r => r[0] ?? null);

    const reactionCounts = await db
      .select({
        reactionType: blogPostReactions.reactionType,
        count: count(),
      })
      .from(blogPostReactions)
      .where(eq(blogPostReactions.postId, post.id))
      .groupBy(blogPostReactions.reactionType);

    return {
      post,
      translation,
      author,
      featuredImage,
      ogImage,
      categories,
      tags,
      galleries: galleriesWithMedia,
      seo,
      reactionCounts,
    };
  },
);

export const getBlogPosts = cached(
  (organizationId: string | null, locale: Locale, filters: BlogPostFilters) =>
    `blog:list:${organizationId ?? "global"}:${locale}:${JSON.stringify(filters)}`,
  async (
    organizationId: string | null,
    locale: Locale,
    filters: BlogPostFilters,
  ): Promise<{ items: BlogPostListItem[]; meta: BlogPaginationMeta }> => {
    if (!isValidLocale(locale)) return { items: [], meta: emptyMeta(filters) };
    if (filters.status && filters.status !== "PUBLISHED") {
      return { items: [], meta: emptyMeta(filters) };
    }
    const db = getDrizzle();

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? BLOG_DEFAULTS.postsPerPage));
    const offset = (page - 1) * limit;

    const conditions: (ReturnType<typeof eq> | ReturnType<typeof and> | ReturnType<typeof or> | ReturnType<typeof ilike> | ReturnType<typeof inArray>)[] = [
      orgScope(blogPosts, organizationId),
      eq(blogPostTranslations.locale, locale),
      publicBlogPostScope(blogPosts) as ReturnType<typeof and>,
    ];

    if (filters.categorySlug) {
      conditions.push(
        inArray(
          blogPosts.id,
          db
            .select({ postId: blogPostCategories.postId })
            .from(blogPostCategories)
            .innerJoin(blogCategories, eq(blogPostCategories.categoryId, blogCategories.id))
            .leftJoin(
              blogCategoryTranslations,
              and(
                eq(blogCategoryTranslations.categoryId, blogCategories.id),
                eq(blogCategoryTranslations.locale, locale),
              ),
            )
            .where(
              and(
                orgScope(blogCategories, organizationId),
                or(
                  eq(blogCategoryTranslations.slug, filters.categorySlug),
                  and(isNull(blogCategoryTranslations.id), eq(blogCategories.slug, filters.categorySlug)),
                ),
              ),
            ),
        ),
      );
    }

    if (filters.tagSlug) {
      conditions.push(
        inArray(
          blogPosts.id,
          db
            .select({ postId: blogPostTags.postId })
            .from(blogPostTags)
            .innerJoin(blogTags, eq(blogPostTags.tagId, blogTags.id))
            .leftJoin(
              blogTagTranslations,
              and(eq(blogTagTranslations.tagId, blogTags.id), eq(blogTagTranslations.locale, locale)),
            )
            .where(
              and(
                orgScope(blogTags, organizationId),
                or(
                  eq(blogTagTranslations.slug, filters.tagSlug),
                  and(isNull(blogTagTranslations.id), eq(blogTags.slug, filters.tagSlug)),
                ),
              ),
            ),
        ),
      );
    }

    if (filters.authorId) {
      conditions.push(eq(blogPosts.authorId, filters.authorId));
    }

    if (filters.searchQuery) {
      const q = `%${filters.searchQuery}%`;
      conditions.push(
        or(
          ilike(blogPostTranslations.title, q),
          ilike(blogPostTranslations.excerpt, q),
          ilike(blogPostTranslations.content, q),
        ) as ReturnType<typeof or>,
      );
    }

    if (filters.featuredOnly) {
      conditions.push(eq(blogPosts.isFeatured, true));
    }

    const orderBy =
      filters.sortBy === "viewCount"
        ? [desc(blogPosts.viewCount), desc(blogPosts.publishedAt)]
        : filters.sortBy === "title"
          ? [filters.sortOrder === "asc" ? asc(blogPostTranslations.title) : desc(blogPostTranslations.title)]
          : filters.sortBy === "createdAt"
            ? [filters.sortOrder === "asc" ? asc(blogPosts.createdAt) : desc(blogPosts.createdAt)]
            : [filters.sortOrder === "asc" ? asc(blogPosts.publishedAt) : desc(blogPosts.publishedAt)];

    const stickyOrder = [desc(blogPosts.isSticky), ...orderBy];

    const rows = await db
      .select({
        post: blogPosts,
        translation: blogPostTranslations,
        author: { id: user.id, name: user.name, image: user.image },
        featuredImage: { id: mediaFiles.id, url: mediaFiles.url },
      })
      .from(blogPosts)
      .innerJoin(blogPostTranslations, eq(blogPostTranslations.postId, blogPosts.id))
      .leftJoin(user, eq(user.id, blogPosts.authorId))
      .leftJoin(mediaFiles, eq(mediaFiles.id, blogPosts.featuredImageId))
      .where(and(...conditions))
      .orderBy(...stickyOrder)
      .limit(limit)
      .offset(offset);

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(blogPosts)
      .innerJoin(blogPostTranslations, eq(blogPostTranslations.postId, blogPosts.id))
      .where(and(...conditions));

    const items = await hydrateBlogPostListItems(rows, locale);

    return {
      items,
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
        hasNextPage: offset + limit < Number(total),
        hasPrevPage: page > 1,
      },
    };
  },
);

// ─── Authors ─────────────────────────────────────────────────────────────────

export const getBlogAuthorByUsername = cached(
  (organizationId: string | null, username: string) =>
    `blog:author:${organizationId ?? "global"}:${username}`,
  async (organizationId: string | null, username: string) => {
    const db = getDrizzle();

    const [author] = await db
      .select({
        id: user.id,
        name: user.name,
        image: user.image,
        bio: user.bio,
        website: user.website,
        twitter: user.twitter,
        linkedin: user.linkedin,
      })
      .from(user)
      .where(eq(user.username, username))
      .limit(1);

    if (!author) return null;

    const [{ value: postCount }] = await db
      .select({ value: count() })
      .from(blogPosts)
      .where(
        and(
          eq(blogPosts.authorId, author.id),
          orgScope(blogPosts, organizationId),
          publishedScope(blogPosts),
        ),
      );

    return { ...author, postCount: Number(postCount) };
  },
);

export const getRelatedBlogPosts = cached(
  (
    organizationId: string | null,
    locale: Locale,
    postId: string,
    categoryIds: string[],
    tagIds: string[],
    limit: number,
  ) =>
    `blog:related:${organizationId ?? "global"}:${locale}:${postId}:${categoryIds.join(",")}:${tagIds.join(",")}:${limit}`,
  async (
    organizationId: string | null,
    locale: Locale,
    postId: string,
    categoryIds: string[],
    tagIds: string[],
    limit = 3,
  ): Promise<BlogPostListItem[]> => {
    if (!isValidLocale(locale) || limit < 1) return [];

    const db = getDrizzle();
    const scoreMap = new Map<string, number>();

    if (categoryIds.length > 0) {
      const categoryMatches = await db
        .select({ postId: blogPostCategories.postId })
        .from(blogPostCategories)
        .innerJoin(blogPosts, eq(blogPostCategories.postId, blogPosts.id))
        .innerJoin(
          blogPostTranslations,
          and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, locale)),
        )
        .where(
          and(
            orgScope(blogPosts, organizationId),
            publishedScope(blogPosts),
            inArray(blogPostCategories.categoryId, categoryIds),
          ),
        );

      for (const match of categoryMatches) {
        if (match.postId === postId) continue;
        scoreMap.set(match.postId, (scoreMap.get(match.postId) ?? 0) + 2);
      }
    }

    if (tagIds.length > 0) {
      const tagMatches = await db
        .select({ postId: blogPostTags.postId })
        .from(blogPostTags)
        .innerJoin(blogPosts, eq(blogPostTags.postId, blogPosts.id))
        .innerJoin(
          blogPostTranslations,
          and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, locale)),
        )
        .where(
          and(
            orgScope(blogPosts, organizationId),
            publishedScope(blogPosts),
            inArray(blogPostTags.tagId, tagIds),
          ),
        );

      for (const match of tagMatches) {
        if (match.postId === postId) continue;
        scoreMap.set(match.postId, (scoreMap.get(match.postId) ?? 0) + 1);
      }
    }

    const rankedIds = [...scoreMap.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([id]) => id);

    if (rankedIds.length === 0) {
      const { items } = await getBlogPosts(organizationId, locale, { limit: limit + 1 });
      return items.filter((item) => item.post.id !== postId).slice(0, limit);
    }

    const rows = await db
      .select({
        post: blogPosts,
        translation: blogPostTranslations,
        author: { id: user.id, name: user.name, image: user.image },
        featuredImage: { id: mediaFiles.id, url: mediaFiles.url },
      })
      .from(blogPosts)
      .innerJoin(blogPostTranslations, eq(blogPostTranslations.postId, blogPosts.id))
      .leftJoin(user, eq(user.id, blogPosts.authorId))
      .leftJoin(mediaFiles, eq(mediaFiles.id, blogPosts.featuredImageId))
      .where(
        and(
          orgScope(blogPosts, organizationId),
          publishedScope(blogPosts),
          eq(blogPostTranslations.locale, locale),
          inArray(blogPosts.id, rankedIds),
        ),
      )
      .orderBy(desc(blogPosts.publishedAt));

    let items = await hydrateBlogPostListItems(rows, locale);

    items = items
      .filter((item) => item.post.id !== postId)
      .sort((left, right) => {
        const scoreDiff = (scoreMap.get(right.post.id) ?? 0) - (scoreMap.get(left.post.id) ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return Number(right.post.publishedAt?.getTime() ?? 0) - Number(left.post.publishedAt?.getTime() ?? 0);
      })
      .slice(0, limit);

    if (items.length >= limit) {
      return items;
    }

    const seen = new Set(items.map((item) => item.post.id));
    seen.add(postId);

    const { items: recentItems } = await getBlogPosts(organizationId, locale, {
      limit: limit + seen.size,
    });

    for (const item of recentItems) {
      if (seen.has(item.post.id)) continue;
      items.push(item);
      seen.add(item.post.id);
      if (items.length >= limit) break;
    }

    return items;
  },
);

function emptyMeta(filters: BlogPostFilters): BlogPaginationMeta {
  return {
    total: 0,
    page: filters.page ?? 1,
    limit: filters.limit ?? BLOG_DEFAULTS.postsPerPage,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  };
}

// ─── Categories ──────────────────────────────────────────────────────────────

export const getBlogCategories = cached(
  (organizationId: string | null, locale: Locale) =>
    `blog:categories:${organizationId ?? "global"}:${locale}`,
  async (
    organizationId: string | null,
    locale: Locale,
  ): Promise<Array<BlogCategory & { translation: BlogCategoryTranslation | null; postCount: number }>> => {
    if (!isValidLocale(locale)) return [];
    const db = getDrizzle();

    // Single round-trip: join categories → translations, then resolve published
    // post counts via one grouped subquery (avoids the previous N+1 of one
    // COUNT per category).
    const categories = await db
      .select({
        category: blogCategories,
        translation: blogCategoryTranslations,
      })
      .from(blogCategories)
      .leftJoin(
        blogCategoryTranslations,
        and(
          eq(blogCategoryTranslations.categoryId, blogCategories.id),
          eq(blogCategoryTranslations.locale, locale),
        ),
      )
      .where(orgScope(blogCategories, organizationId))
      .orderBy(asc(blogCategories.sortOrder), asc(blogCategoryTranslations.name));

    const categoryIds = categories.map((c) => c.category.id);
    const postCounts = new Map<string, number>();
    if (categoryIds.length > 0) {
      const counts = await db
        .select({ categoryId: blogPostCategories.categoryId, value: count() })
        .from(blogPostCategories)
        .innerJoin(blogPosts, eq(blogPostCategories.postId, blogPosts.id))
        .where(
          and(inArray(blogPostCategories.categoryId, categoryIds), publicBlogPostScope(blogPosts)),
        )
        .groupBy(blogPostCategories.categoryId);
      for (const row of counts) postCounts.set(row.categoryId, Number(row.value));
    }

    return categories.map(({ category, translation }) => ({
      ...category,
      slug: translation?.slug ?? category.slug,
      translation,
      postCount: postCounts.get(category.id) ?? 0,
    }));
  },
);

export const getBlogCategoryBySlug = cached(
  (organizationId: string | null, locale: Locale, slug: string) =>
    `blog:category:${organizationId ?? "global"}:${locale}:${slug}`,
  async (organizationId: string | null, locale: Locale, slug: string) => {
    if (!isValidLocale(locale)) return null;
    const db = getDrizzle();

    const [row] = await db
      .select({ category: blogCategories, translation: blogCategoryTranslations })
      .from(blogCategories)
      .leftJoin(
        blogCategoryTranslations,
        and(
          eq(blogCategoryTranslations.categoryId, blogCategories.id),
          eq(blogCategoryTranslations.locale, locale),
        ),
      )
      .where(
        and(
          orgScope(blogCategories, organizationId),
          or(
            eq(blogCategoryTranslations.slug, slug),
            and(isNull(blogCategoryTranslations.id), eq(blogCategories.slug, slug)),
          ),
        ),
      )
      .limit(1);

    return row ?? null;
  },
);

// ─── Tags ────────────────────────────────────────────────────────────────────

export const getBlogTags = cached(
  (organizationId: string | null, locale: Locale) =>
    `blog:tags:${organizationId ?? "global"}:${locale}`,
  async (
    organizationId: string | null,
    locale: Locale,
  ): Promise<Array<BlogTag & { translation: BlogTagTranslation | null; postCount: number }>> => {
    if (!isValidLocale(locale)) return [];
    const db = getDrizzle();

    // Single round-trip: join tags → translations → published post counts via
    // a grouped subquery (avoids the previous N+1 of one COUNT per tag).
    const tags = await db
      .select({ tag: blogTags, translation: blogTagTranslations })
      .from(blogTags)
      .leftJoin(
        blogTagTranslations,
        and(eq(blogTagTranslations.tagId, blogTags.id), eq(blogTagTranslations.locale, locale)),
      )
      .where(orgScope(blogTags, organizationId))
      .orderBy(asc(blogTagTranslations.name));

    const tagIds = tags.map((t) => t.tag.id);
    const postCounts = new Map<string, number>();
    if (tagIds.length > 0) {
      const counts = await db
        .select({ tagId: blogPostTags.tagId, value: count() })
        .from(blogPostTags)
        .innerJoin(blogPosts, eq(blogPostTags.postId, blogPosts.id))
        .where(and(inArray(blogPostTags.tagId, tagIds), publicBlogPostScope(blogPosts)))
        .groupBy(blogPostTags.tagId);
      for (const row of counts) postCounts.set(row.tagId, Number(row.value));
    }

    return tags.map(({ tag, translation }) => ({
      ...tag,
      slug: translation?.slug ?? tag.slug,
      translation,
      postCount: postCounts.get(tag.id) ?? 0,
    }));
  },
);

export const getBlogTagBySlug = cached(
  (organizationId: string | null, locale: Locale, slug: string) =>
    `blog:tag:${organizationId ?? "global"}:${locale}:${slug}`,
  async (organizationId: string | null, locale: Locale, slug: string) => {
    if (!isValidLocale(locale)) return null;
    const db = getDrizzle();

    const [row] = await db
      .select({ tag: blogTags, translation: blogTagTranslations })
      .from(blogTags)
      .leftJoin(
        blogTagTranslations,
        and(eq(blogTagTranslations.tagId, blogTags.id), eq(blogTagTranslations.locale, locale)),
      )
      .where(
        and(
          orgScope(blogTags, organizationId),
          or(
            eq(blogTagTranslations.slug, slug),
            and(isNull(blogTagTranslations.id), eq(blogTags.slug, slug)),
          ),
        ),
      )
      .limit(1);

    return row ?? null;
  },
);

// ─── Comments ────────────────────────────────────────────────────────────────

export async function getBlogComments(
  postId: string,
  opts: { status?: "APPROVED" | "PENDING" | "ALL"; page?: number; limit?: number } = {},
) {
  const db = getDrizzle();
  const status = opts.status ?? "APPROVED";
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? BLOG_DEFAULTS.commentsPerPage));
  const offset = (page - 1) * limit;

  const baseConditions = [eq(blogComments.postId, postId), isNull(blogComments.parentId)];
  const statusCondition = status !== "ALL" ? eq(blogComments.status, status) : undefined;

  const roots = await db
    .select({
      comment: blogComments,
      author: { id: user.id, name: user.name, image: user.image },
    })
    .from(blogComments)
    .innerJoin(blogPosts, eq(blogComments.postId, blogPosts.id))
    .leftJoin(user, eq(user.id, blogComments.authorId))
    .where(
      statusCondition
        ? and(...baseConditions, statusCondition, publicBlogPostScope(blogPosts))
        : and(...baseConditions, publicBlogPostScope(blogPosts)),
    )
    .orderBy(desc(blogComments.createdAt))
    .limit(limit)
    .offset(offset);

  const withReplies = await Promise.all(
    roots.map(async ({ comment, author }) => {
      const replyConditions = [eq(blogComments.parentId, comment.id)];
      if (status !== "ALL") replyConditions.push(eq(blogComments.status, status));

      const replies = await db
        .select({
          comment: blogComments,
          author: { id: user.id, name: user.name, image: user.image },
        })
        .from(blogComments)
        .leftJoin(user, eq(user.id, blogComments.authorId))
        .where(and(...replyConditions))
        .orderBy(asc(blogComments.createdAt));

      return {
        ...comment,
        author,
        replies: replies.map((r) => ({ ...r.comment, author: r.author })),
      };
    }),
  );

  return withReplies;
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export async function getBlogReviews(
  postId: string,
  opts: { status?: "APPROVED" | "PENDING" | "ALL"; page?: number; limit?: number; userId?: string } = {},
) {
  const db = getDrizzle();
  const status = opts.status ?? "APPROVED";
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? BLOG_DEFAULTS.reviewsPerPage));
  const offset = (page - 1) * limit;

  const conditions = [eq(blogPostReviews.postId, postId)];
  if (status !== "ALL") conditions.push(eq(blogPostReviews.status, status));

  const reviews = await db
    .select({
      review: blogPostReviews,
      author: { id: user.id, name: user.name, image: user.image },
    })
    .from(blogPostReviews)
    .innerJoin(blogPosts, eq(blogPostReviews.postId, blogPosts.id))
    .leftJoin(user, eq(user.id, blogPostReviews.authorId))
    .where(and(...conditions, publicBlogPostScope(blogPosts)))
    .orderBy(desc(blogPostReviews.createdAt))
    .limit(limit)
    .offset(offset);

  return Promise.all(
    reviews.map(async ({ review, author }) => {
      let userVote: boolean | null = null;
      if (opts.userId) {
        const [vote] = await db
          .select({ isHelpful: blogPostReviewHelpful.isHelpful })
          .from(blogPostReviewHelpful)
          .where(
            and(
              eq(blogPostReviewHelpful.reviewId, review.id),
              eq(blogPostReviewHelpful.userId, opts.userId),
            ),
          )
          .limit(1);
        userVote = vote?.isHelpful ?? null;
      }
      return { ...review, author, userVote };
    }),
  );
}

export async function getBlogReviewStats(postId: string) {
  const db = getDrizzle();
  const rows = await db
    .select({ rating: blogPostReviews.rating, count: count() })
    .from(blogPostReviews)
    .innerJoin(blogPosts, eq(blogPostReviews.postId, blogPosts.id))
    .where(
      and(
        eq(blogPostReviews.postId, postId),
        eq(blogPostReviews.status, "APPROVED"),
        publicBlogPostScope(blogPosts),
      ),
    )
    .groupBy(blogPostReviews.rating);

  const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
  const average = total > 0 ? rows.reduce((sum, r) => sum + Number(r.count) * r.rating, 0) / total : 0;

  return { total, average: Math.round(average * 10) / 10, distribution: rows };
}

// ─── Related / internal links ────────────────────────────────────────────────

export async function getBlogPostLinks(
  postId: string,
  linkType?: "RELATED" | "PREVIOUS" | "NEXT" | "REFERENCE",
) {
  const db = getDrizzle();
  const conditions = [eq(blogPostLinks.sourcePostId, postId)];
  if (linkType) conditions.push(eq(blogPostLinks.linkType, linkType));

  const rows = await db
    .select({
      id: blogPostLinks.id,
      linkType: blogPostLinks.linkType,
      sortOrder: blogPostLinks.sortOrder,
      targetId: blogPosts.id,
      targetSlug: blogPosts.slug,
      targetTranslationSlug: blogPostTranslations.slug,
      targetTranslationTitle: blogPostTranslations.title,
    })
    .from(blogPostLinks)
    .innerJoin(blogPosts, eq(blogPostLinks.targetPostId, blogPosts.id))
    .leftJoin(
      blogPostTranslations,
      and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, "fr")),
    )
    .where(and(...conditions, publicBlogPostScope(blogPosts)))
    .orderBy(asc(blogPostLinks.sortOrder), asc(blogPostLinks.linkType));

  return rows.map((row) => ({
    id: row.id,
    linkType: row.linkType,
    sortOrder: row.sortOrder,
    target: {
      id: row.targetId,
      slug: row.targetTranslationSlug ?? row.targetSlug,
      title: row.targetTranslationTitle ?? null,
    },
  }));
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function getBlogPostStats(postId: string, days = 30) {
  const db = getDrizzle();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  const views = await db
    .select({ date: blogPostViewStats.date, count: count() })
    .from(blogPostViewStats)
    .where(and(eq(blogPostViewStats.postId, postId), gte(blogPostViewStats.date, sinceStr)))
    .groupBy(blogPostViewStats.date)
    .orderBy(asc(blogPostViewStats.date));

  const referrers = await db
    .select({ referrer: blogPostViewStats.referrer, count: count() })
    .from(blogPostViewStats)
    .where(and(eq(blogPostViewStats.postId, postId), gte(blogPostViewStats.date, sinceStr)))
    .groupBy(blogPostViewStats.referrer)
    .orderBy(desc(count()))
    .limit(10);

  const devices = await db
    .select({ deviceType: blogPostViewStats.deviceType, count: count() })
    .from(blogPostViewStats)
    .where(and(eq(blogPostViewStats.postId, postId), gte(blogPostViewStats.date, sinceStr)))
    .groupBy(blogPostViewStats.deviceType);

  return { views, referrers, devices };
}

// ─── Admin helpers ───────────────────────────────────────────────────────────

/**
/**
 * Loads gallery media for many galleries in a single round-trip (IN query)
 * instead of one query per gallery. Returns a Map keyed by galleryId so the
 * caller can attach media to each gallery without an N+1 loop.
 */
export async function getBlogGalleriesWithMedia(galleryIds: string[]) {
  const result = new Map<string, Array<{ mediaId: string; altText: string; caption: string | null; sortOrder: number; file: { id: string; url: string } }>>();
  if (galleryIds.length === 0) return result;

  const db = getDrizzle();
  const rows = await db
    .select({
      galleryId: blogPostGalleryMedia.galleryId,
      mediaId: blogPostGalleryMedia.mediaId,
      altText: blogPostGalleryMedia.altText,
      caption: blogPostGalleryMedia.caption,
      sortOrder: blogPostGalleryMedia.sortOrder,
      file: { id: mediaFiles.id, url: mediaFiles.url },
    })
    .from(blogPostGalleryMedia)
    .innerJoin(mediaFiles, eq(blogPostGalleryMedia.mediaId, mediaFiles.id))
    .where(inArray(blogPostGalleryMedia.galleryId, galleryIds))
    .orderBy(asc(blogPostGalleryMedia.sortOrder));

  for (const row of rows) {
    const list = result.get(row.galleryId) ?? [];
    list.push({
      mediaId: row.mediaId,
      altText: row.altText,
      caption: row.caption,
      sortOrder: row.sortOrder,
      file: row.file,
    });
    result.set(row.galleryId, list);
  }
  return result;
}
export async function getBlogPostForAdmin(postId: string) {
  const db = getDrizzle();
  const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, postId)).limit(1);
  if (!post) return null;

  const translations = await db
    .select()
    .from(blogPostTranslations)
    .where(eq(blogPostTranslations.postId, postId));

  const categories = await db
    .select({ categoryId: blogPostCategories.categoryId })
    .from(blogPostCategories)
    .where(eq(blogPostCategories.postId, postId));

  const tags = await db
    .select({ tagId: blogPostTags.tagId })
    .from(blogPostTags)
    .where(eq(blogPostTags.postId, postId));

  const revisions = await db
    .select({
      revision: blogPostRevisions,
      author: { id: user.id, name: user.name },
    })
    .from(blogPostRevisions)
    .leftJoin(user, eq(user.id, blogPostRevisions.authorId))
    .where(eq(blogPostRevisions.postId, postId))
    .orderBy(desc(blogPostRevisions.createdAt))
    .limit(20);

  const lock = await db
    .select()
    .from(blogPostLocks)
    .where(eq(blogPostLocks.postId, postId))
    .limit(1)
    .then(r => r[0] ?? null);

  const [seo] = await db
    .select()
    .from(blogPostSeo)
    .where(eq(blogPostSeo.postId, postId))
    .limit(1);

  const galleries = await db
    .select({
      id: blogPostGalleries.id,
      title: blogPostGalleries.title,
      description: blogPostGalleries.description,
      sortOrder: blogPostGalleries.sortOrder,
    })
    .from(blogPostGalleries)
    .where(eq(blogPostGalleries.postId, postId))
    .orderBy(asc(blogPostGalleries.sortOrder));

  const galleriesWithMedia = await (async () => {
    const mediaByGallery = await getBlogGalleriesWithMedia(galleries.map((g) => g.id));
    return galleries.map((gallery) => ({ ...gallery, media: mediaByGallery.get(gallery.id) ?? [] }));
  })();

  const links = await db
    .select({
      id: blogPostLinks.id,
      linkType: blogPostLinks.linkType,
      sortOrder: blogPostLinks.sortOrder,
      targetId: blogPosts.id,
      targetSlug: blogPosts.slug,
      targetTitle: blogPostTranslations.title,
    })
    .from(blogPostLinks)
    .innerJoin(blogPosts, eq(blogPostLinks.targetPostId, blogPosts.id))
    .leftJoin(
      blogPostTranslations,
      and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, "fr")),
    )
    .where(eq(blogPostLinks.sourcePostId, postId))
    .orderBy(asc(blogPostLinks.sortOrder));

  return {
    post,
    translations,
    seo: seo ?? null,
    galleries: galleriesWithMedia,
    links: links.map((link) => ({
      id: link.id,
      linkType: link.linkType,
      sortOrder: link.sortOrder,
      target: {
        id: link.targetId,
        slug: link.targetSlug,
        title: link.targetTitle ?? null,
      },
    })),
    categoryIds: categories.map((c) => c.categoryId),
    tagIds: tags.map((t) => t.tagId),
    revisions,
    lock,
  };
}

export async function getBlogPostsForAdmin(
  organizationId: string | null,
  locale?: Locale,
  opts: { page?: number; limit?: number; status?: BlogPostStatus; search?: string } = {},
) {
  const db = getDrizzle();
  const categoryLocale = locale ?? "fr";
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions = [orgScope(blogPosts, organizationId)];
  if (locale) conditions.push(eq(blogPostTranslations.locale, locale));
  if (opts.status) conditions.push(eq(blogPosts.status, opts.status));
  if (opts.search) {
    const q = `%${opts.search}%`;
    const searchCondition = or(
      ilike(blogPostTranslations.title, q),
      ilike(blogPostTranslations.slug, q),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const rows = await db
    .select({
      post: blogPosts,
      translation: blogPostTranslations,
      author: { id: user.id, name: user.name },
    })
    .from(blogPosts)
    .leftJoin(
      blogPostTranslations,
      locale
        ? and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, locale))
        : eq(blogPostTranslations.postId, blogPosts.id),
    )
    .leftJoin(user, eq(user.id, blogPosts.authorId))
    .where(and(...conditions))
    .orderBy(desc(blogPosts.updatedAt))
    .limit(limit)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(blogPosts)
    .leftJoin(
      blogPostTranslations,
      locale
        ? and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, locale))
        : eq(blogPostTranslations.postId, blogPosts.id),
    )
    .where(and(...conditions));

  const rowsWithCategories = await Promise.all(
    rows.map(async (row) => {
      const categories = await db
        .select({
          id: blogCategories.id,
          slug: sql<string>`coalesce(${blogCategoryTranslations.slug}, ${blogCategories.slug})`,
          name: blogCategoryTranslations.name,
        })
        .from(blogPostCategories)
        .innerJoin(blogCategories, eq(blogPostCategories.categoryId, blogCategories.id))
        .leftJoin(
          blogCategoryTranslations,
          and(
            eq(blogCategoryTranslations.categoryId, blogCategories.id),
            eq(blogCategoryTranslations.locale, categoryLocale),
          ),
        )
        .where(eq(blogPostCategories.postId, row.post.id))
        .orderBy(
          asc(blogCategories.sortOrder),
          asc(sql<string>`coalesce(${blogCategoryTranslations.slug}, ${blogCategories.slug})`),
          asc(blogCategories.id),
        );

      return {
        ...row,
        categories,
      };
    }),
  );

  return {
    rows: rowsWithCategories,
    meta: {
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(Number(total) / limit),
      hasNextPage: offset + limit < Number(total),
      hasPrevPage: page > 1,
    },
  };
}

export async function getBlogModerationQueue(
  organizationId: string | null,
  opts: { page?: number; limit?: number } = {},
) {
  const db = getDrizzle();
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;

  const comments = await db
    .select({
      comment: blogComments,
      post: blogPosts,
      author: { id: user.id, name: user.name },
    })
    .from(blogComments)
    .innerJoin(blogPosts, eq(blogComments.postId, blogPosts.id))
    .leftJoin(user, eq(user.id, blogComments.authorId))
    .where(and(orgScope(blogPosts, organizationId), eq(blogComments.status, "PENDING")))
    .orderBy(desc(blogComments.createdAt))
    .limit(limit)
    .offset(offset);

  const reviews = await db
    .select({
      review: blogPostReviews,
      post: blogPosts,
      author: { id: user.id, name: user.name },
    })
    .from(blogPostReviews)
    .innerJoin(blogPosts, eq(blogPostReviews.postId, blogPosts.id))
    .leftJoin(user, eq(user.id, blogPostReviews.authorId))
    .where(and(orgScope(blogPosts, organizationId), eq(blogPostReviews.status, "PENDING")))
    .orderBy(desc(blogPostReviews.createdAt))
    .limit(limit)
    .offset(offset);

  const reports = await db
    .select({
      report: blogReports,
      post: blogPosts,
      reporter: { id: user.id, name: user.name },
    })
    .from(blogReports)
    .leftJoin(blogComments, eq(blogReports.commentId, blogComments.id))
    .leftJoin(blogPostReviews, eq(blogReports.reviewId, blogPostReviews.id))
    .leftJoin(
      blogPosts,
      or(
        eq(blogReports.postId, blogPosts.id),
        eq(blogComments.postId, blogPosts.id),
        eq(blogPostReviews.postId, blogPosts.id),
      ),
    )
    .leftJoin(user, eq(user.id, blogReports.reporterId))
    .where(and(orgScope(blogPosts, organizationId), eq(blogReports.status, "PENDING")))
    .orderBy(desc(blogReports.createdAt))
    .limit(limit)
    .offset(offset);

  return { comments, reviews, reports };
}

// ─── Notifications ───────────────────────────────────────────────────────────

export async function getBlogNotifications(
  userId: string,
  opts: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
    organizationId?: string | null;
  } = {},
) {
  const db = getDrizzle();
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      notification: blogNotifications,
      post: { id: blogPosts.id, slug: blogPosts.slug },
      fromUser: { id: user.id, name: user.name, image: user.image },
    })
    .from(blogNotifications)
    .leftJoin(blogComments, eq(blogNotifications.commentId, blogComments.id))
    .leftJoin(blogPostReviews, eq(blogNotifications.reviewId, blogPostReviews.id))
    .leftJoin(
      blogPosts,
      or(
        eq(blogNotifications.postId, blogPosts.id),
        eq(blogComments.postId, blogPosts.id),
        eq(blogPostReviews.postId, blogPosts.id),
      ),
    )
    .leftJoin(user, eq(user.id, blogNotifications.fromUserId))
    .where(
      and(
        eq(blogNotifications.userId, userId),
        opts.unreadOnly ? eq(blogNotifications.isRead, false) : undefined,
        Object.hasOwn(opts, "organizationId")
          ? opts.organizationId === null
            ? isNull(blogNotifications.organizationId)
            : eq(blogNotifications.organizationId, opts.organizationId!)
          : undefined,
      ),
    )
    .orderBy(desc(blogNotifications.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}

export async function getUnreadBlogNotificationCount(
  userId: string,
  organizationId?: string | null,
): Promise<number> {
  const db = getDrizzle();
  const query = db
    .select({ value: count() })
    .from(blogNotifications)
    .leftJoin(blogComments, eq(blogNotifications.commentId, blogComments.id))
    .leftJoin(blogPostReviews, eq(blogNotifications.reviewId, blogPostReviews.id))
    .leftJoin(
      blogPosts,
      or(
        eq(blogNotifications.postId, blogPosts.id),
        eq(blogComments.postId, blogPosts.id),
        eq(blogPostReviews.postId, blogPosts.id),
      ),
    );

  const [{ value }] = await query.where(
    and(
      eq(blogNotifications.userId, userId),
      eq(blogNotifications.isRead, false),
      organizationId === undefined
        ? undefined
        : organizationId === null
          ? isNull(blogNotifications.organizationId)
          : eq(blogNotifications.organizationId, organizationId),
    ),
  );
  return Number(value);
}

/**
 * Returns the set of published post slugs for a tenant + locale.
 * Used by the content layer to detect dead internal links without N+1 queries
 * (one query returns every valid target for the whole blog).
 */
export const getBlogPostSlugs = cached(
  (organizationId: string | null, locale: Locale) =>
    `blog:slugs:${organizationId ?? "global"}:${locale}`,
  async (organizationId: string | null, locale: Locale): Promise<Set<string>> => {
    if (!isValidLocale(locale)) return new Set();
    const db = getDrizzle();
    const rows = await db
      .select({ slug: blogPostTranslations.slug })
      .from(blogPostTranslations)
      .innerJoin(blogPosts, eq(blogPosts.id, blogPostTranslations.postId))
      .where(
        and(
          eq(blogPostTranslations.locale, locale),
          orgScope(blogPosts, organizationId),
          publishedScope(blogPosts),
        ),
      );
    return new Set(rows.map((r) => r.slug));
  },
);

/**
 * Set of all valid internal-link targets for a tenant+locale: post slugs,
 * category slugs and tag slugs. Used by RichContent to flag dead links so a
 * broken internal link is shown as a warning instead of silently navigating
 * nowhere. Previously only post slugs were returned, causing valid category/tag
 * links to be falsely flagged as dead.
 */
export const getBlogValidLinkTargets = cached(
  (organizationId: string | null, locale: Locale) =>
    `blog:link-targets:${organizationId ?? "global"}:${locale}`,
  async (organizationId: string | null, locale: Locale): Promise<Set<string>> => {
    if (!isValidLocale(locale)) return new Set();
    const [postSlugs, categories, tags] = await Promise.all([
      getBlogPostSlugs(organizationId, locale),
      getBlogCategories(organizationId, locale),
      getBlogTags(organizationId, locale),
    ]);
    const targets = new Set<string>(postSlugs);
    for (const c of categories) targets.add(c.slug);
    for (const t of tags) targets.add(t.slug);
    return targets;
  },
);
