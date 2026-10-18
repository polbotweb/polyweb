import { eq, and, desc, asc, or, ilike, inArray, isNull, sql, count, gte } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { cached } from "@database/cache";
import { Effect } from "effect";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import type { DbError } from "@/lib/effect/errors";
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

/** Hydrate une page de liste en 5 requêtes groupées parallèles (pas de N+1 par ligne). */
const hydrateBlogPostListItemsEffect = (
  rows: BlogPostListRow[],
  locale: Locale,
): Effect.Effect<BlogPostListItem[], DbError> =>
  rows.length === 0 ? Effect.succeed([]) : Effect.gen(function* () {
  const db = getDrizzle();
  const postIds = rows.map((row) => row.post.id);

  // Batched across the whole page (5 fixed queries) instead of 5 queries PER
  // post row — avoids an N+1 pattern on listing pages. SQL-level ORDER BY is
  // still correct per-post after grouping in JS: a stable multi-key sort over
  // category attributes preserves each post's relative order once filtered.
  const [categoryRows, tagRows, commentRows, reviewRows, reactionRows] = yield* Effect.all(
    [
      dbTry("blog.listCategories", () =>
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
      ),
      dbTry("blog.listTags", () =>
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
      ),
      dbTry("blog.listCommentCounts", () =>
        db
          .select({ postId: blogComments.postId, value: count() })
          .from(blogComments)
          .where(and(inArray(blogComments.postId, postIds), eq(blogComments.status, "APPROVED")))
          .groupBy(blogComments.postId),
      ),
      dbTry("blog.listReviewStats", () =>
        db
          .select({
            postId: blogPostReviews.postId,
            avgRating: sql<string>`avg(${blogPostReviews.rating})`,
            reviewCount: count(),
          })
          .from(blogPostReviews)
          .where(and(inArray(blogPostReviews.postId, postIds), eq(blogPostReviews.status, "APPROVED")))
          .groupBy(blogPostReviews.postId),
      ),
      dbTry("blog.listReactionCounts", () =>
        db
          .select({
            postId: blogPostReactions.postId,
            reactionType: blogPostReactions.reactionType,
            value: count(),
          })
          .from(blogPostReactions)
          .where(inArray(blogPostReactions.postId, postIds))
          .groupBy(blogPostReactions.postId, blogPostReactions.reactionType),
      ),
    ],
    { concurrency: "unbounded" },
  );

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
});

// ─── Posts ───────────────────────────────────────────────────────────────────

/**
 * Article public par slug traduit : la ligne principale, puis toutes les lectures dépendantes
 * (auteur, images, catégories, tags, galeries + médias, SEO, réactions) en parallèle.
 */
const blogPostBySlugEffect = (organizationId: string | null, locale: Locale, slug: string) =>
  !isValidLocale(locale)
    ? Effect.succeed(null)
    : Effect.gen(function* () {
        const [row] = yield* dbTry("blog.postBySlug", () =>
          getDrizzle()
            .select({ post: blogPosts, translation: blogPostTranslations })
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
            .limit(1),
        );
        if (!row) return null;
        const { post, translation } = row;
        const db = getDrizzle();
        const first = <T>(rows: T[]) => rows[0] ?? null;

        const parts = yield* Effect.all(
          {
            author: post.authorId
              ? dbTry("blog.postAuthor", () =>
                  db.select({ id: user.id, name: user.name, image: user.image }).from(user).where(eq(user.id, post.authorId!)).limit(1),
                ).pipe(Effect.map(first))
              : Effect.succeed(null),
            featuredImage: post.featuredImageId
              ? dbTry("blog.postFeaturedImage", () =>
                  db
                    .select({ id: mediaFiles.id, url: mediaFiles.url, width: mediaFiles.width, height: mediaFiles.height })
                    .from(mediaFiles)
                    .where(eq(mediaFiles.id, post.featuredImageId!))
                    .limit(1),
                ).pipe(Effect.map(first))
              : Effect.succeed(null),
            ogImage: translation.ogImageId
              ? dbTry("blog.postOgImage", () =>
                  db.select({ id: mediaFiles.id, url: mediaFiles.url }).from(mediaFiles).where(eq(mediaFiles.id, translation.ogImageId!)).limit(1),
                ).pipe(Effect.map(first))
              : Effect.succeed(null),
            categories: dbTry("blog.postCategories", () =>
              db
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
                  and(eq(blogCategoryTranslations.categoryId, blogCategories.id), eq(blogCategoryTranslations.locale, locale)),
                )
                .where(eq(blogPostCategories.postId, post.id))
                .orderBy(
                  asc(blogCategories.sortOrder),
                  asc(sql<string>`coalesce(${blogCategoryTranslations.slug}, ${blogCategories.slug})`),
                  asc(blogCategories.id),
                ),
            ),
            tags: dbTry("blog.postTags", () =>
              db
                .select({
                  id: blogTags.id,
                  slug: sql<string>`coalesce(${blogTagTranslations.slug}, ${blogTags.slug})`,
                  color: blogTags.color,
                  name: blogTagTranslations.name,
                })
                .from(blogPostTags)
                .innerJoin(blogTags, eq(blogPostTags.tagId, blogTags.id))
                .leftJoin(blogTagTranslations, and(eq(blogTagTranslations.tagId, blogTags.id), eq(blogTagTranslations.locale, locale)))
                .where(eq(blogPostTags.postId, post.id)),
            ),
            galleries: dbTry("blog.postGalleries", () =>
              db.select().from(blogPostGalleries).where(eq(blogPostGalleries.postId, post.id)).orderBy(asc(blogPostGalleries.sortOrder)),
            ).pipe(
              Effect.flatMap((galleries) =>
                blogGalleriesWithMediaEffect(galleries.map((g) => g.id)).pipe(
                  Effect.map((mediaByGallery) => galleries.map((gallery) => ({ ...gallery, media: mediaByGallery.get(gallery.id) ?? [] }))),
                ),
              ),
            ),
            seo: dbTry("blog.postSeo", () =>
              db.select().from(blogPostSeo).where(and(eq(blogPostSeo.postId, post.id), eq(blogPostSeo.locale, locale))).limit(1),
            ).pipe(Effect.map(first)),
            reactionCounts: dbTry("blog.postReactions", () =>
              db
                .select({ reactionType: blogPostReactions.reactionType, count: count() })
                .from(blogPostReactions)
                .where(eq(blogPostReactions.postId, post.id))
                .groupBy(blogPostReactions.reactionType),
            ),
          },
          { concurrency: "unbounded" },
        );

        return {
          post,
          translation,
          author: parts.author,
          featuredImage: parts.featuredImage,
          ogImage: parts.ogImage,
          categories: parts.categories,
          tags: parts.tags,
          galleries: parts.galleries,
          seo: parts.seo,
          reactionCounts: parts.reactionCounts,
        };
      });

export const getBlogPostBySlug = cached(
  (organizationId: string | null, locale: Locale, slug: string) =>
    `blog:post:${organizationId ?? "global"}:${locale}:${slug}`,
  (organizationId: string | null, locale: Locale, slug: string) => runOrThrow(blogPostBySlugEffect(organizationId, locale, slug)),
);

type BlogPostListResult = { items: BlogPostListItem[]; meta: BlogPaginationMeta };

/** Liste publique paginée et filtrée ; page et total en parallèle, puis hydratation groupée. */
const blogPostsEffect = (
  organizationId: string | null,
  locale: Locale,
  filters: BlogPostFilters,
): Effect.Effect<BlogPostListResult, DbError> =>
  Effect.suspend(() => {
    if (!isValidLocale(locale)) return Effect.succeed({ items: [] as BlogPostListItem[], meta: emptyMeta(filters) });
    if (filters.status && filters.status !== "PUBLISHED") {
      return Effect.succeed({ items: [] as BlogPostListItem[], meta: emptyMeta(filters) });
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

    return Effect.gen(function* () {
      const [rows, [{ value: total }]] = yield* Effect.all(
        [
          dbTry("blog.posts", () =>
            db
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
      .offset(offset),
          ),
          dbTry("blog.postsCount", () =>
            db
      .select({ value: count() })
      .from(blogPosts)
      .innerJoin(blogPostTranslations, eq(blogPostTranslations.postId, blogPosts.id))
      .where(and(...conditions)),
          ),
        ],
        { concurrency: "unbounded" },
      );
      const items = yield* hydrateBlogPostListItemsEffect(rows, locale);
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
    });
  });

export const getBlogPosts = cached(
  (organizationId: string | null, locale: Locale, filters: BlogPostFilters) =>
    `blog:list:${organizationId ?? "global"}:${locale}:${JSON.stringify(filters)}`,
  (organizationId: string | null, locale: Locale, filters: BlogPostFilters): Promise<BlogPostListResult> =>
    runOrThrow(blogPostsEffect(organizationId, locale, filters)),
);

// ─── Authors ─────────────────────────────────────────────────────────────────

/** Profil public d'un auteur + nombre de posts publiés dans le tenant (null si inconnu). */
const blogAuthorByUsernameEffect = (organizationId: string | null, username: string) =>
  Effect.gen(function* () {
    const [author] = yield* dbTry("blog.authorByUsername", () =>
      getDrizzle()
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
        .limit(1),
    );
    if (!author) return null;
    const [{ value: postCount }] = yield* dbTry("blog.authorPostCount", () =>
      getDrizzle()
        .select({ value: count() })
        .from(blogPosts)
        .where(and(eq(blogPosts.authorId, author.id), orgScope(blogPosts, organizationId), publishedScope(blogPosts))),
    );
    return { ...author, postCount: Number(postCount) };
  });

export const getBlogAuthorByUsername = cached(
  (organizationId: string | null, username: string) =>
    `blog:author:${organizationId ?? "global"}:${username}`,
  (organizationId: string | null, username: string) => runOrThrow(blogAuthorByUsernameEffect(organizationId, username)),
);

/** Candidats liés (catégorie = 2 points, tag = 1) hors post courant, publiés dans la locale. */
const relatedScores = (organizationId: string | null, locale: Locale, postId: string, categoryIds: string[], tagIds: string[]) => {
  const db = getDrizzle();
  const translated = and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, locale));
  return Effect.all(
    [
      categoryIds.length === 0
        ? Effect.succeed([] as { postId: string }[])
        : dbTry("blog.relatedByCategory", () =>
            db
              .select({ postId: blogPostCategories.postId })
              .from(blogPostCategories)
              .innerJoin(blogPosts, eq(blogPostCategories.postId, blogPosts.id))
              .innerJoin(blogPostTranslations, translated)
              .where(and(orgScope(blogPosts, organizationId), publishedScope(blogPosts), inArray(blogPostCategories.categoryId, categoryIds))),
          ),
      tagIds.length === 0
        ? Effect.succeed([] as { postId: string }[])
        : dbTry("blog.relatedByTag", () =>
            db
              .select({ postId: blogPostTags.postId })
              .from(blogPostTags)
              .innerJoin(blogPosts, eq(blogPostTags.postId, blogPosts.id))
              .innerJoin(blogPostTranslations, translated)
              .where(and(orgScope(blogPosts, organizationId), publishedScope(blogPosts), inArray(blogPostTags.tagId, tagIds))),
          ),
    ],
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map(([categoryMatches, tagMatches]) => {
      const scoreMap = new Map<string, number>();
      for (const match of categoryMatches) {
        if (match.postId !== postId) scoreMap.set(match.postId, (scoreMap.get(match.postId) ?? 0) + 2);
      }
      for (const match of tagMatches) {
        if (match.postId !== postId) scoreMap.set(match.postId, (scoreMap.get(match.postId) ?? 0) + 1);
      }
      return scoreMap;
    }),
  );
};

/** Posts liés classés par score puis date ; complétés par les plus récents si besoin. */
const relatedBlogPostsEffect = (
  organizationId: string | null,
  locale: Locale,
  postId: string,
  categoryIds: string[],
  tagIds: string[],
  limit = 3,
): Effect.Effect<BlogPostListItem[], DbError> =>
  !isValidLocale(locale) || limit < 1
    ? Effect.succeed([])
    : Effect.gen(function* () {
        const scoreMap = yield* relatedScores(organizationId, locale, postId, categoryIds, tagIds);
        const rankedIds = [...scoreMap.entries()].sort((left, right) => right[1] - left[1]).map(([id]) => id);

        if (rankedIds.length === 0) {
          const { items } = yield* blogPostsEffect(organizationId, locale, { limit: limit + 1 });
          return items.filter((item) => item.post.id !== postId).slice(0, limit);
        }

        const rows = yield* dbTry("blog.relatedPosts", () =>
          getDrizzle()
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
            .orderBy(desc(blogPosts.publishedAt)),
        );

        const items = (yield* hydrateBlogPostListItemsEffect(rows, locale))
          .filter((item) => item.post.id !== postId)
          .sort((left, right) => {
            const scoreDiff = (scoreMap.get(right.post.id) ?? 0) - (scoreMap.get(left.post.id) ?? 0);
            if (scoreDiff !== 0) return scoreDiff;
            return Number(right.post.publishedAt?.getTime() ?? 0) - Number(left.post.publishedAt?.getTime() ?? 0);
          })
          .slice(0, limit);
        if (items.length >= limit) return items;

        const seen = new Set(items.map((item) => item.post.id));
        seen.add(postId);
        const { items: recentItems } = yield* blogPostsEffect(organizationId, locale, { limit: limit + seen.size });
        for (const item of recentItems) {
          if (seen.has(item.post.id)) continue;
          items.push(item);
          seen.add(item.post.id);
          if (items.length >= limit) break;
        }
        return items;
      });

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
  (organizationId: string | null, locale: Locale, postId: string, categoryIds: string[], tagIds: string[], limit = 3) =>
    runOrThrow(relatedBlogPostsEffect(organizationId, locale, postId, categoryIds, tagIds, limit)),
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

// ─── Categories & tags ───────────────────────────────────────────────────────

/*
 * Taxonomie Effect-native : requêtes via `dbTry`, comptes de posts publiés en une requête
 * groupée (pas de N+1). Les exports Promise restent `cached(...)` autour d'un adaptateur
 * `runOrThrow` : le cache (clés inchangées) est conservé pour les appelants existants.
 */
type CategoryWithCount = BlogCategory & { translation: BlogCategoryTranslation | null; postCount: number };
type TagWithCount = BlogTag & { translation: BlogTagTranslation | null; postCount: number };

const blogCategoriesEffect = (organizationId: string | null, locale: Locale): Effect.Effect<CategoryWithCount[], DbError> =>
  isValidLocale(locale)
    ? Effect.gen(function* () {
        const categories = yield* dbTry("blog.categories", () =>
          getDrizzle()
            .select({ category: blogCategories, translation: blogCategoryTranslations })
            .from(blogCategories)
            .leftJoin(
              blogCategoryTranslations,
              and(eq(blogCategoryTranslations.categoryId, blogCategories.id), eq(blogCategoryTranslations.locale, locale)),
            )
            .where(orgScope(blogCategories, organizationId))
            .orderBy(asc(blogCategories.sortOrder), asc(blogCategoryTranslations.name)),
        );
        const categoryIds = categories.map((c) => c.category.id);
        const counts = categoryIds.length === 0
          ? []
          : yield* dbTry("blog.categoryPostCounts", () =>
              getDrizzle()
                .select({ categoryId: blogPostCategories.categoryId, value: count() })
                .from(blogPostCategories)
                .innerJoin(blogPosts, eq(blogPostCategories.postId, blogPosts.id))
                .where(and(inArray(blogPostCategories.categoryId, categoryIds), publicBlogPostScope(blogPosts)))
                .groupBy(blogPostCategories.categoryId),
            );
        const postCounts = new Map(counts.map((r) => [r.categoryId, Number(r.value)]));
        return categories.map(({ category, translation }) => ({
          ...category,
          slug: translation?.slug ?? category.slug,
          translation,
          postCount: postCounts.get(category.id) ?? 0,
        }));
      })
    : Effect.succeed([]);

const blogCategoryBySlugEffect = (organizationId: string | null, locale: Locale, slug: string) =>
  isValidLocale(locale)
    ? dbTry("blog.categoryBySlug", () =>
        getDrizzle()
          .select({ category: blogCategories, translation: blogCategoryTranslations })
          .from(blogCategories)
          .leftJoin(
            blogCategoryTranslations,
            and(eq(blogCategoryTranslations.categoryId, blogCategories.id), eq(blogCategoryTranslations.locale, locale)),
          )
          .where(
            and(
              orgScope(blogCategories, organizationId),
              or(eq(blogCategoryTranslations.slug, slug), and(isNull(blogCategoryTranslations.id), eq(blogCategories.slug, slug))),
            ),
          )
          .limit(1),
      ).pipe(Effect.map(([row]) => row ?? null))
    : Effect.succeed(null);

const blogTagsEffect = (organizationId: string | null, locale: Locale): Effect.Effect<TagWithCount[], DbError> =>
  isValidLocale(locale)
    ? Effect.gen(function* () {
        const tags = yield* dbTry("blog.tags", () =>
          getDrizzle()
            .select({ tag: blogTags, translation: blogTagTranslations })
            .from(blogTags)
            .leftJoin(blogTagTranslations, and(eq(blogTagTranslations.tagId, blogTags.id), eq(blogTagTranslations.locale, locale)))
            .where(orgScope(blogTags, organizationId))
            .orderBy(asc(blogTagTranslations.name)),
        );
        const tagIds = tags.map((t) => t.tag.id);
        const counts = tagIds.length === 0
          ? []
          : yield* dbTry("blog.tagPostCounts", () =>
              getDrizzle()
                .select({ tagId: blogPostTags.tagId, value: count() })
                .from(blogPostTags)
                .innerJoin(blogPosts, eq(blogPostTags.postId, blogPosts.id))
                .where(and(inArray(blogPostTags.tagId, tagIds), publicBlogPostScope(blogPosts)))
                .groupBy(blogPostTags.tagId),
            );
        const postCounts = new Map(counts.map((r) => [r.tagId, Number(r.value)]));
        return tags.map(({ tag, translation }) => ({
          ...tag,
          slug: translation?.slug ?? tag.slug,
          translation,
          postCount: postCounts.get(tag.id) ?? 0,
        }));
      })
    : Effect.succeed([]);

const blogTagBySlugEffect = (organizationId: string | null, locale: Locale, slug: string) =>
  isValidLocale(locale)
    ? dbTry("blog.tagBySlug", () =>
        getDrizzle()
          .select({ tag: blogTags, translation: blogTagTranslations })
          .from(blogTags)
          .leftJoin(blogTagTranslations, and(eq(blogTagTranslations.tagId, blogTags.id), eq(blogTagTranslations.locale, locale)))
          .where(
            and(
              orgScope(blogTags, organizationId),
              or(eq(blogTagTranslations.slug, slug), and(isNull(blogTagTranslations.id), eq(blogTags.slug, slug))),
            ),
          )
          .limit(1),
      ).pipe(Effect.map(([row]) => row ?? null))
    : Effect.succeed(null);

export const getBlogCategories = cached(
  (organizationId: string | null, locale: Locale) => `blog:categories:${organizationId ?? "global"}:${locale}`,
  (organizationId: string | null, locale: Locale) => runOrThrow(blogCategoriesEffect(organizationId, locale)),
);

export const getBlogCategoryBySlug = cached(
  (organizationId: string | null, locale: Locale, slug: string) =>
    `blog:category:${organizationId ?? "global"}:${locale}:${slug}`,
  (organizationId: string | null, locale: Locale, slug: string) =>
    runOrThrow(blogCategoryBySlugEffect(organizationId, locale, slug)),
);

export const getBlogTags = cached(
  (organizationId: string | null, locale: Locale) => `blog:tags:${organizationId ?? "global"}:${locale}`,
  (organizationId: string | null, locale: Locale) => runOrThrow(blogTagsEffect(organizationId, locale)),
);

export const getBlogTagBySlug = cached(
  (organizationId: string | null, locale: Locale, slug: string) =>
    `blog:tag:${organizationId ?? "global"}:${locale}:${slug}`,
  (organizationId: string | null, locale: Locale, slug: string) =>
    runOrThrow(blogTagBySlugEffect(organizationId, locale, slug)),
);

// ─── Comments ────────────────────────────────────────────────────────────────

/*
 * Lectures Effect-natives (engagement, liens, statistiques, galeries) : chaque requête
 * passe par `dbTry` (DbError typé, span `db.blog.<op>`), les requêtes indépendantes sont
 * composées en parallèle. Les exports Promise historiques sont des adaptateurs `runOrThrow`
 * (même résultat, cause d'origine relevée) : les appelants existants ne changent pas.
 */
type CommentStatusFilter = "APPROVED" | "PENDING" | "ALL";
const authorColumns = { id: user.id, name: user.name, image: user.image };

const blogCommentsEffect = (postId: string, opts: { status?: CommentStatusFilter; page?: number; limit?: number } = {}) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const status = opts.status ?? "APPROVED";
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? BLOG_DEFAULTS.commentsPerPage));
    const offset = (page - 1) * limit;
    const baseConditions = [eq(blogComments.postId, postId), isNull(blogComments.parentId)];
    const statusCondition = status !== "ALL" ? eq(blogComments.status, status) : undefined;

    const roots = yield* dbTry("blog.comments", () =>
      db
        .select({ comment: blogComments, author: authorColumns })
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
        .offset(offset),
    );

    return yield* Effect.forEach(
      roots,
      ({ comment, author }) => {
        const replyConditions = [eq(blogComments.parentId, comment.id)];
        if (status !== "ALL") replyConditions.push(eq(blogComments.status, status));
        return dbTry("blog.commentReplies", () =>
          db
            .select({ comment: blogComments, author: authorColumns })
            .from(blogComments)
            .leftJoin(user, eq(user.id, blogComments.authorId))
            .where(and(...replyConditions))
            .orderBy(asc(blogComments.createdAt)),
        ).pipe(Effect.map((replies) => ({ ...comment, author, replies: replies.map((r) => ({ ...r.comment, author: r.author })) })));
      },
      { concurrency: "unbounded" },
    );
  });

const blogReviewsEffect = (postId: string, opts: { status?: CommentStatusFilter; page?: number; limit?: number; userId?: string } = {}) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const status = opts.status ?? "APPROVED";
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? BLOG_DEFAULTS.reviewsPerPage));
    const offset = (page - 1) * limit;
    const conditions = [eq(blogPostReviews.postId, postId)];
    if (status !== "ALL") conditions.push(eq(blogPostReviews.status, status));

    const reviews = yield* dbTry("blog.reviews", () =>
      db
        .select({ review: blogPostReviews, author: authorColumns })
        .from(blogPostReviews)
        .innerJoin(blogPosts, eq(blogPostReviews.postId, blogPosts.id))
        .leftJoin(user, eq(user.id, blogPostReviews.authorId))
        .where(and(...conditions, publicBlogPostScope(blogPosts)))
        .orderBy(desc(blogPostReviews.createdAt))
        .limit(limit)
        .offset(offset),
    );

    const viewerId = opts.userId;
    return yield* Effect.forEach(
      reviews,
      ({ review, author }) => {
        const vote: Effect.Effect<boolean | null, DbError> = viewerId
          ? dbTry("blog.reviewVote", () =>
              db
                .select({ isHelpful: blogPostReviewHelpful.isHelpful })
                .from(blogPostReviewHelpful)
                .where(and(eq(blogPostReviewHelpful.reviewId, review.id), eq(blogPostReviewHelpful.userId, viewerId)))
                .limit(1),
            ).pipe(Effect.map(([row]) => row?.isHelpful ?? null))
          : Effect.succeed(null);
        return vote.pipe(Effect.map((userVote) => ({ ...review, author, userVote })));
      },
      { concurrency: "unbounded" },
    );
  });

const blogReviewStatsEffect = (postId: string) =>
  dbTry("blog.reviewStats", () =>
    getDrizzle()
      .select({ rating: blogPostReviews.rating, count: count() })
      .from(blogPostReviews)
      .innerJoin(blogPosts, eq(blogPostReviews.postId, blogPosts.id))
      .where(and(eq(blogPostReviews.postId, postId), eq(blogPostReviews.status, "APPROVED"), publicBlogPostScope(blogPosts)))
      .groupBy(blogPostReviews.rating),
  ).pipe(
    Effect.map((rows) => {
      const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
      const average = total > 0 ? rows.reduce((sum, r) => sum + Number(r.count) * r.rating, 0) / total : 0;
      return { total, average: Math.round(average * 10) / 10, distribution: rows };
    }),
  );

const blogPostLinksEffect = (postId: string, linkType?: "RELATED" | "PREVIOUS" | "NEXT" | "REFERENCE") => {
  const conditions = [eq(blogPostLinks.sourcePostId, postId)];
  if (linkType) conditions.push(eq(blogPostLinks.linkType, linkType));
  return dbTry("blog.postLinks", () =>
    getDrizzle()
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
      .leftJoin(blogPostTranslations, and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, "fr")))
      .where(and(...conditions, publicBlogPostScope(blogPosts)))
      .orderBy(asc(blogPostLinks.sortOrder), asc(blogPostLinks.linkType)),
  ).pipe(
    Effect.map((rows) =>
      rows.map((row) => ({
        id: row.id,
        linkType: row.linkType,
        sortOrder: row.sortOrder,
        target: { id: row.targetId, slug: row.targetTranslationSlug ?? row.targetSlug, title: row.targetTranslationTitle ?? null },
      })),
    ),
  );
};

const blogPostStatsEffect = (postId: string, days = 30) => Effect.suspend(() => {
  const db = getDrizzle();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];
  const scope = and(eq(blogPostViewStats.postId, postId), gte(blogPostViewStats.date, sinceStr));
  // Trois agrégats indépendants : exécutés en parallèle.
  return Effect.all(
    {
      views: dbTry("blog.stats.views", () =>
        db.select({ date: blogPostViewStats.date, count: count() }).from(blogPostViewStats).where(scope).groupBy(blogPostViewStats.date).orderBy(asc(blogPostViewStats.date)),
      ),
      referrers: dbTry("blog.stats.referrers", () =>
        db.select({ referrer: blogPostViewStats.referrer, count: count() }).from(blogPostViewStats).where(scope).groupBy(blogPostViewStats.referrer).orderBy(desc(count())).limit(10),
      ),
      devices: dbTry("blog.stats.devices", () =>
        db.select({ deviceType: blogPostViewStats.deviceType, count: count() }).from(blogPostViewStats).where(scope).groupBy(blogPostViewStats.deviceType),
      ),
    },
    { concurrency: "unbounded" },
  );
});

type GalleryMediaItem = { mediaId: string; altText: string; caption: string | null; sortOrder: number; file: { id: string; url: string } };

/**
 * Médias de plusieurs galeries en un seul aller-retour (IN) plutôt qu'une requête par
 * galerie ; Map indexée par galleryId (pas de boucle N+1 côté appelant).
 */
const blogGalleriesWithMediaEffect = (galleryIds: string[]) =>
  galleryIds.length === 0
    ? Effect.succeed(new Map<string, GalleryMediaItem[]>())
    : dbTry("blog.galleriesWithMedia", () =>
        getDrizzle()
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
          .orderBy(asc(blogPostGalleryMedia.sortOrder)),
      ).pipe(
        Effect.map((rows) => {
          const result = new Map<string, GalleryMediaItem[]>();
          for (const row of rows) {
            const list = result.get(row.galleryId) ?? [];
            list.push({ mediaId: row.mediaId, altText: row.altText, caption: row.caption, sortOrder: row.sortOrder, file: row.file });
            result.set(row.galleryId, list);
          }
          return result;
        }),
      );

const engagementEffects = {
  getBlogComments: blogCommentsEffect,
  getBlogReviews: blogReviewsEffect,
  getBlogReviewStats: blogReviewStatsEffect,
  getBlogPostLinks: blogPostLinksEffect,
  getBlogPostStats: blogPostStatsEffect,
  getBlogGalleriesWithMedia: blogGalleriesWithMediaEffect,
};

// ─── Adaptateurs Promise (contrat historique) ────────────────────────────────

export const getBlogComments = (...args: Parameters<typeof blogCommentsEffect>) => runOrThrow(blogCommentsEffect(...args));
export const getBlogReviews = (...args: Parameters<typeof blogReviewsEffect>) => runOrThrow(blogReviewsEffect(...args));
export const getBlogReviewStats = (postId: string) => runOrThrow(blogReviewStatsEffect(postId));
export const getBlogPostLinks = (...args: Parameters<typeof blogPostLinksEffect>) => runOrThrow(blogPostLinksEffect(...args));
export const getBlogPostStats = (postId: string, days = 30) => runOrThrow(blogPostStatsEffect(postId, days));
export const getBlogGalleriesWithMedia = (galleryIds: string[]) => runOrThrow(blogGalleriesWithMediaEffect(galleryIds));

// ─── Admin helpers ───────────────────────────────────────────────────────────

// ─── Admin (Effect natif) ────────────────────────────────────────────────────

const blogPostForAdminEffect = (postId: string) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const [post] = yield* dbTry("blog.admin.post", () => db.select().from(blogPosts).where(eq(blogPosts.id, postId)).limit(1));
    if (!post) return null;

    // Lectures indépendantes de l'article : exécutées en parallèle.
    const { translations, categories, tags, revisions, lock, seo, galleries, links } = yield* Effect.all(
      {
        translations: dbTry("blog.admin.translations", () => db.select().from(blogPostTranslations).where(eq(blogPostTranslations.postId, postId))),
        categories: dbTry("blog.admin.categories", () => db.select({ categoryId: blogPostCategories.categoryId }).from(blogPostCategories).where(eq(blogPostCategories.postId, postId))),
        tags: dbTry("blog.admin.tags", () => db.select({ tagId: blogPostTags.tagId }).from(blogPostTags).where(eq(blogPostTags.postId, postId))),
        revisions: dbTry("blog.admin.revisions", () =>
          db
            .select({ revision: blogPostRevisions, author: { id: user.id, name: user.name } })
            .from(blogPostRevisions)
            .leftJoin(user, eq(user.id, blogPostRevisions.authorId))
            .where(eq(blogPostRevisions.postId, postId))
            .orderBy(desc(blogPostRevisions.createdAt))
            .limit(20),
        ),
        lock: dbTry("blog.admin.lock", () => db.select().from(blogPostLocks).where(eq(blogPostLocks.postId, postId)).limit(1)).pipe(Effect.map((r) => r[0] ?? null)),
        seo: dbTry("blog.admin.seo", () => db.select().from(blogPostSeo).where(eq(blogPostSeo.postId, postId)).limit(1)).pipe(Effect.map((r) => r[0] ?? null)),
        galleries: dbTry("blog.admin.galleries", () =>
          db
            .select({ id: blogPostGalleries.id, title: blogPostGalleries.title, description: blogPostGalleries.description, sortOrder: blogPostGalleries.sortOrder })
            .from(blogPostGalleries)
            .where(eq(blogPostGalleries.postId, postId))
            .orderBy(asc(blogPostGalleries.sortOrder)),
        ),
        links: dbTry("blog.admin.links", () =>
          db
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
            .leftJoin(blogPostTranslations, and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, "fr")))
            .where(eq(blogPostLinks.sourcePostId, postId))
            .orderBy(asc(blogPostLinks.sortOrder)),
        ),
      },
      { concurrency: "unbounded" },
    );

    const mediaByGallery = yield* blogGalleriesWithMediaEffect(galleries.map((g) => g.id));

    return {
      post,
      translations,
      seo,
      galleries: galleries.map((gallery) => ({ ...gallery, media: mediaByGallery.get(gallery.id) ?? [] })),
      links: links.map((link) => ({
        id: link.id,
        linkType: link.linkType,
        sortOrder: link.sortOrder,
        target: { id: link.targetId, slug: link.targetSlug, title: link.targetTitle ?? null },
      })),
      categoryIds: categories.map((c) => c.categoryId),
      tagIds: tags.map((t) => t.tagId),
      revisions,
      lock,
    };
  });

const blogPostsForAdminEffect = (
  organizationId: string | null,
  locale?: Locale,
  opts: { page?: number; limit?: number; status?: BlogPostStatus; search?: string } = {},
) =>
  Effect.gen(function* () {
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
      const searchCondition = or(ilike(blogPostTranslations.title, q), ilike(blogPostTranslations.slug, q));
      if (searchCondition) conditions.push(searchCondition);
    }
    const translationJoin = locale
      ? and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, locale))
      : eq(blogPostTranslations.postId, blogPosts.id);

    const { rows, total } = yield* Effect.all(
      {
        rows: dbTry("blog.admin.list", () =>
          db
            .select({ post: blogPosts, translation: blogPostTranslations, author: { id: user.id, name: user.name } })
            .from(blogPosts)
            .leftJoin(blogPostTranslations, translationJoin)
            .leftJoin(user, eq(user.id, blogPosts.authorId))
            .where(and(...conditions))
            .orderBy(desc(blogPosts.updatedAt))
            .limit(limit)
            .offset(offset),
        ),
        total: dbTry("blog.admin.count", () =>
          db.select({ value: count() }).from(blogPosts).leftJoin(blogPostTranslations, translationJoin).where(and(...conditions)),
        ).pipe(Effect.map(([row]) => Number(row.value))),
      },
      { concurrency: "unbounded" },
    );

    const categorySlug = sql<string>`coalesce(${blogCategoryTranslations.slug}, ${blogCategories.slug})`;
    const rowsWithCategories = yield* Effect.forEach(
      rows,
      (row) =>
        dbTry("blog.admin.listCategories", () =>
          db
            .select({ id: blogCategories.id, slug: categorySlug, name: blogCategoryTranslations.name })
            .from(blogPostCategories)
            .innerJoin(blogCategories, eq(blogPostCategories.categoryId, blogCategories.id))
            .leftJoin(blogCategoryTranslations, and(eq(blogCategoryTranslations.categoryId, blogCategories.id), eq(blogCategoryTranslations.locale, categoryLocale)))
            .where(eq(blogPostCategories.postId, row.post.id))
            .orderBy(asc(blogCategories.sortOrder), asc(categorySlug), asc(blogCategories.id)),
        ).pipe(Effect.map((categories) => ({ ...row, categories }))),
      { concurrency: "unbounded" },
    );

    return {
      rows: rowsWithCategories,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: offset + limit < total,
        hasPrevPage: page > 1,
      },
    };
  });

const blogModerationQueueEffect = (organizationId: string | null, opts: { page?: number; limit?: number } = {}) => {
  const db = getDrizzle();
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;
  return Effect.all(
    {
      comments: dbTry("blog.moderation.comments", () =>
        db
          .select({ comment: blogComments, post: blogPosts, author: { id: user.id, name: user.name } })
          .from(blogComments)
          .innerJoin(blogPosts, eq(blogComments.postId, blogPosts.id))
          .leftJoin(user, eq(user.id, blogComments.authorId))
          .where(and(orgScope(blogPosts, organizationId), eq(blogComments.status, "PENDING")))
          .orderBy(desc(blogComments.createdAt))
          .limit(limit)
          .offset(offset),
      ),
      reviews: dbTry("blog.moderation.reviews", () =>
        db
          .select({ review: blogPostReviews, post: blogPosts, author: { id: user.id, name: user.name } })
          .from(blogPostReviews)
          .innerJoin(blogPosts, eq(blogPostReviews.postId, blogPosts.id))
          .leftJoin(user, eq(user.id, blogPostReviews.authorId))
          .where(and(orgScope(blogPosts, organizationId), eq(blogPostReviews.status, "PENDING")))
          .orderBy(desc(blogPostReviews.createdAt))
          .limit(limit)
          .offset(offset),
      ),
      reports: dbTry("blog.moderation.reports", () =>
        db
          .select({ report: blogReports, post: blogPosts, reporter: { id: user.id, name: user.name } })
          .from(blogReports)
          .leftJoin(blogComments, eq(blogReports.commentId, blogComments.id))
          .leftJoin(blogPostReviews, eq(blogReports.reviewId, blogPostReviews.id))
          .leftJoin(blogPosts, or(eq(blogReports.postId, blogPosts.id), eq(blogComments.postId, blogPosts.id), eq(blogPostReviews.postId, blogPosts.id)))
          .leftJoin(user, eq(user.id, blogReports.reporterId))
          .where(and(orgScope(blogPosts, organizationId), eq(blogReports.status, "PENDING")))
          .orderBy(desc(blogReports.createdAt))
          .limit(limit)
          .offset(offset),
      ),
    },
    { concurrency: "unbounded" },
  );
};

// ─── Notifications (Effect natif) ────────────────────────────────────────────

const notificationPostJoin = () =>
  or(eq(blogNotifications.postId, blogPosts.id), eq(blogComments.postId, blogPosts.id), eq(blogPostReviews.postId, blogPosts.id));

const blogNotificationsEffect = (
  userId: string,
  opts: { page?: number; limit?: number; unreadOnly?: boolean; organizationId?: string | null } = {},
) => {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;
  return dbTry("blog.notifications", () =>
    getDrizzle()
      .select({
        notification: blogNotifications,
        post: { id: blogPosts.id, slug: blogPosts.slug },
        fromUser: { id: user.id, name: user.name, image: user.image },
      })
      .from(blogNotifications)
      .leftJoin(blogComments, eq(blogNotifications.commentId, blogComments.id))
      .leftJoin(blogPostReviews, eq(blogNotifications.reviewId, blogPostReviews.id))
      .leftJoin(blogPosts, notificationPostJoin())
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
      .offset(offset),
  );
};

const unreadBlogNotificationCountEffect = (userId: string, organizationId?: string | null) =>
  dbTry("blog.notifications.unread", () =>
    getDrizzle()
      .select({ value: count() })
      .from(blogNotifications)
      .leftJoin(blogComments, eq(blogNotifications.commentId, blogComments.id))
      .leftJoin(blogPostReviews, eq(blogNotifications.reviewId, blogPostReviews.id))
      .leftJoin(blogPosts, notificationPostJoin())
      .where(
        and(
          eq(blogNotifications.userId, userId),
          eq(blogNotifications.isRead, false),
          organizationId === undefined
            ? undefined
            : organizationId === null
              ? isNull(blogNotifications.organizationId)
              : eq(blogNotifications.organizationId, organizationId),
        ),
      ),
  ).pipe(Effect.map(([{ value }]) => Number(value)));

/** Lectures blog Effect-natives (migration en cours : les autres passent encore par `liftLoader`). */
export const blogLoaderEffects = {
  ...engagementEffects,
  getBlogPostForAdmin: blogPostForAdminEffect,
  getBlogPostsForAdmin: blogPostsForAdminEffect,
  getBlogModerationQueue: blogModerationQueueEffect,
  getBlogNotifications: blogNotificationsEffect,
  getUnreadBlogNotificationCount: unreadBlogNotificationCountEffect,
};

export const getBlogPostForAdmin = (postId: string) => runOrThrow(blogPostForAdminEffect(postId));
export const getBlogPostsForAdmin = (...args: Parameters<typeof blogPostsForAdminEffect>) => runOrThrow(blogPostsForAdminEffect(...args));
export const getBlogModerationQueue = (...args: Parameters<typeof blogModerationQueueEffect>) => runOrThrow(blogModerationQueueEffect(...args));
export const getBlogNotifications = (...args: Parameters<typeof blogNotificationsEffect>) => runOrThrow(blogNotificationsEffect(...args));
export const getUnreadBlogNotificationCount = (userId: string, organizationId?: string | null): Promise<number> =>
  runOrThrow(unreadBlogNotificationCountEffect(userId, organizationId));

/** Slugs des posts publiés d'un tenant + locale (une requête : détection de liens morts sans N+1). */
const blogPostSlugsEffect = (organizationId: string | null, locale: Locale): Effect.Effect<Set<string>, DbError> =>
  isValidLocale(locale)
    ? dbTry("blog.postSlugs", () =>
        getDrizzle()
          .select({ slug: blogPostTranslations.slug })
          .from(blogPostTranslations)
          .innerJoin(blogPosts, eq(blogPosts.id, blogPostTranslations.postId))
          .where(and(eq(blogPostTranslations.locale, locale), orgScope(blogPosts, organizationId), publishedScope(blogPosts))),
      ).pipe(Effect.map((rows) => new Set(rows.map((r) => r.slug))))
    : Effect.succeed(new Set<string>());

/**
 * Cibles de liens internes valides (slugs de posts, catégories et tags) d'un tenant + locale,
 * utilisées par RichContent pour signaler un lien interne mort. Trois lectures en parallèle.
 */
const blogValidLinkTargetsEffect = (organizationId: string | null, locale: Locale): Effect.Effect<Set<string>, DbError> =>
  isValidLocale(locale)
    ? Effect.all(
        [blogPostSlugsEffect(organizationId, locale), blogCategoriesEffect(organizationId, locale), blogTagsEffect(organizationId, locale)],
        { concurrency: "unbounded" },
      ).pipe(
        Effect.map(([postSlugs, categories, tags]) => {
          const targets = new Set<string>(postSlugs);
          for (const c of categories) targets.add(c.slug);
          for (const t of tags) targets.add(t.slug);
          return targets;
        }),
      )
    : Effect.succeed(new Set<string>());

export const getBlogPostSlugs = cached(
  (organizationId: string | null, locale: Locale) => `blog:slugs:${organizationId ?? "global"}:${locale}`,
  (organizationId: string | null, locale: Locale) => runOrThrow(blogPostSlugsEffect(organizationId, locale)),
);

export const getBlogValidLinkTargets = cached(
  (organizationId: string | null, locale: Locale) => `blog:link-targets:${organizationId ?? "global"}:${locale}`,
  (organizationId: string | null, locale: Locale) => runOrThrow(blogValidLinkTargetsEffect(organizationId, locale)),
);

/**
 * Lectures publiques Effect-natives (article, auteur, taxonomie, liens) NON mises en cache. `effect.ts` continue d'exposer
 * les versions `cached` (via `liftLoader`) pour conserver le cache côté pages.
 */
export const blogPublicReadEffects = {
  getBlogPosts: blogPostsEffect,
  getRelatedBlogPosts: relatedBlogPostsEffect,
  getBlogPostBySlug: blogPostBySlugEffect,
  getBlogAuthorByUsername: blogAuthorByUsernameEffect,
  getBlogCategories: blogCategoriesEffect,
  getBlogCategoryBySlug: blogCategoryBySlugEffect,
  getBlogTags: blogTagsEffect,
  getBlogTagBySlug: blogTagBySlugEffect,
  getBlogPostSlugs: blogPostSlugsEffect,
  getBlogValidLinkTargets: blogValidLinkTargetsEffect,
};
