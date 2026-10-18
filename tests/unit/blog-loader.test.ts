import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({ select: mockSelect })),
}));

vi.mock('@database/cache', () => ({
  // Bypass the TTL cache entirely so tests exercise the real query logic.
  cached: (_keyFn: any, fn: any) => fn,
}));

vi.mock('@database/schemas', () => ({
  blogPosts: { id: 'id', organizationId: 'organizationId', status: 'status', lockedBy: 'lockedBy', isFeatured: 'isFeatured', isSticky: 'isSticky', publishedAt: 'publishedAt', viewCount: 'viewCount', createdAt: 'createdAt', authorId: 'authorId', featuredImageId: 'featuredImageId' },
  blogPostTranslations: { id: 'id', postId: 'postId', locale: 'locale', slug: 'slug', title: 'title', excerpt: 'excerpt', content: 'content' },
  blogCategories: { id: 'id', organizationId: 'organizationId', slug: 'slug', sortOrder: 'sortOrder', parentId: 'parentId', color: 'color' },
  blogCategoryTranslations: { id: 'id', categoryId: 'categoryId', locale: 'locale', slug: 'slug', name: 'name' },
  blogTags: { id: 'id', organizationId: 'organizationId', slug: 'slug', color: 'color' },
  blogTagTranslations: { id: 'id', tagId: 'tagId', locale: 'locale', slug: 'slug', name: 'name' },
  blogPostCategories: { postId: 'postId', categoryId: 'categoryId' },
  blogPostTags: { postId: 'postId', tagId: 'tagId' },
  blogComments: { id: 'id', postId: 'postId', parentId: 'parentId', status: 'status', createdAt: 'createdAt', authorId: 'authorId' },
  blogCommentModerations: { id: 'id' },
  blogPostRevisions: { id: 'id', postId: 'postId', authorId: 'authorId', createdAt: 'createdAt' },
  blogPostGalleries: { id: 'id', postId: 'postId', sortOrder: 'sortOrder' },
  blogPostGalleryMedia: { galleryId: 'galleryId', mediaId: 'mediaId', sortOrder: 'sortOrder' },
  blogPostReviews: { id: 'id', postId: 'postId', authorId: 'authorId', status: 'status', rating: 'rating', createdAt: 'createdAt' },
  blogPostReviewHelpful: { reviewId: 'reviewId', userId: 'userId', isHelpful: 'isHelpful' },
  blogReports: { id: 'id', postId: 'postId', commentId: 'commentId', reviewId: 'reviewId', status: 'status', reporterId: 'reporterId', createdAt: 'createdAt' },
  blogPostFavorites: { postId: 'postId', userId: 'userId' },
  blogPostReactions: { postId: 'postId', userId: 'userId', reactionType: 'reactionType' },
  blogPostSeo: { id: 'id', postId: 'postId', locale: 'locale' },
  blogPostViewStats: { id: 'id', postId: 'postId', date: 'date', hour: 'hour', referrer: 'referrer', deviceType: 'deviceType' },
  blogNotifications: { id: 'id', userId: 'userId', isRead: 'isRead', createdAt: 'createdAt', postId: 'postId', commentId: 'commentId', reviewId: 'reviewId', fromUserId: 'fromUserId' },
  blogPostLocks: { id: 'id', postId: 'postId' },
  blogPostLinks: { id: 'id' },
  mediaFiles: { id: 'id', url: 'url', width: 'width', height: 'height' },
  user: { id: 'id', name: 'name', image: 'image', username: 'username' },
}));

vi.mock('@i18n/utils', () => ({ isValidLocale: (l: string) => ['fr', 'en', 'es', 'ar'].includes(l) }));

import {
  getBlogPosts,
  getBlogPostBySlug,
  getBlogCategories,
  getBlogTags,
  getBlogReviewStats,
  getBlogModerationQueue,
  getBlogNotifications,
  getUnreadBlogNotificationCount,
} from '@/database/loaders/blog.loader';

function makeChain(rows: any[]) {
  const terminal: any = Object.assign(Promise.resolve(rows), {
    offset: vi.fn(() => Promise.resolve(rows)),
  });
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
    limit: vi.fn(() => terminal),
    offset: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => resolve(rows),
  };
  return chain;
}

beforeEach(() => {
  mockSelect.mockReset();
});

describe('getBlogPosts', () => {
  it('returns empty items + zeroed pagination meta when there are no posts', async () => {
    mockSelect
      .mockReturnValueOnce(makeChain([])) // main rows
      .mockReturnValueOnce(makeChain([{ value: 0 }])); // count

    const { items, meta } = await getBlogPosts(null, 'fr', { page: 1, limit: 9 });

    expect(items).toEqual([]);
    expect(meta).toEqual({
      total: 0,
      page: 1,
      limit: 9,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    });

  });

  it('returns an empty result for an invalid locale without querying the DB', async () => {
    const { items, meta } = await getBlogPosts(null, 'xx' as any, { page: 1 });

    expect(items).toEqual([]);
    expect(meta.total).toBe(0);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('never exposes a non-published status through the public list loader', async () => {
    const { items, meta } = await getBlogPosts(null, 'fr', { page: 1, status: 'DRAFT' });

    expect(items).toEqual([]);
    expect(meta.total).toBe(0);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('hydrates a single post row with categories/tags/counts and computes pagination', async () => {
    const postRow = {
      post: { id: 'post-1', viewCount: 5, isFeatured: false, isSticky: false, publishedAt: new Date() },
      translation: { title: 'Titre', slug: 'titre', excerpt: null, content: 'contenu' },
      author: { id: 'author-1', name: 'Auteur', image: null },
      featuredImage: null,
    };

    mockSelect
      .mockReturnValueOnce(makeChain([postRow])) // main rows
      .mockReturnValueOnce(makeChain([{ value: 25 }])) // total count
      .mockReturnValueOnce(makeChain([])) // categories (batched)
      .mockReturnValueOnce(makeChain([])) // tags (batched)
      .mockReturnValueOnce(makeChain([{ postId: 'post-1', value: 3 }])) // comment counts (batched)
      .mockReturnValueOnce(makeChain([{ postId: 'post-1', avgRating: '4.5', reviewCount: 2 }])) // review agg (batched)
      .mockReturnValueOnce(makeChain([])); // reactions (batched)

    const { items, meta } = await getBlogPosts(null, 'fr', { page: 2, limit: 9 });

    expect(items).toHaveLength(1);
    expect(items[0].commentCount).toBe(3);
    expect(items[0].rating).toBe(4.5);
    expect(items[0].reviewCount).toBe(2);
    expect(meta).toEqual({
      total: 25,
      page: 2,
      limit: 9,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true,
    });
  });
});

describe('getBlogPostBySlug', () => {
  it('applies tenant and visibility in the initial joined query before LIMIT 1', async () => {
    const initialQuery = makeChain([]);
    mockSelect.mockReturnValueOnce(initialQuery);

    const result = await getBlogPostBySlug('org-1', 'fr', 'shared-slug');

    expect(result).toBeNull();
    expect(mockSelect).toHaveBeenCalledOnce();
    expect(initialQuery.innerJoin).toHaveBeenCalledOnce();
    expect(initialQuery.where).toHaveBeenCalledOnce();
    expect(initialQuery.where.mock.invocationCallOrder[0]).toBeLessThan(
      initialQuery.limit.mock.invocationCallOrder[0],
    );
  });
});

describe('getBlogCategories', () => {
  it('maps translations and post counts, falling back to the canonical slug', async () => {
    mockSelect
      .mockReturnValueOnce(
        makeChain([
          { category: { id: 'cat-1', slug: 'voyage', organizationId: null }, translation: null },
        ]),
      )
      // grouped post-count subquery: one row per categoryId with its count
      .mockReturnValueOnce(makeChain([{ categoryId: 'cat-1', value: 7 }]));

    const result = await getBlogCategories(null, 'fr');

    expect(result).toEqual([
      expect.objectContaining({ id: 'cat-1', slug: 'voyage', translation: null, postCount: 7 }),
    ]);
  });

  it('returns an empty array for an invalid locale', async () => {
    const result = await getBlogCategories(null, 'xx' as any);
    expect(result).toEqual([]);
  });
});

describe('getBlogTags', () => {
  it('maps translations and post counts', async () => {
    mockSelect
      .mockReturnValueOnce(
        makeChain([{ tag: { id: 'tag-1', slug: 'lac', organizationId: null }, translation: { name: 'Lac', slug: 'lac' } }]),
      )
      // grouped post-count subquery: one row per tagId with its count
      .mockReturnValueOnce(makeChain([{ tagId: 'tag-1', value: 4 }]));

    const result = await getBlogTags(null, 'fr');

    expect(result).toEqual([expect.objectContaining({ id: 'tag-1', slug: 'lac', postCount: 4 })]);
  });
});

describe('getBlogReviewStats', () => {
  it('computes total + weighted average from a rating distribution', async () => {
    mockSelect.mockReturnValueOnce(
      makeChain([
        { rating: 5, count: 2 },
        { rating: 4, count: 1 },
      ]),
    );

    const stats = await getBlogReviewStats('post-1');

    expect(stats.total).toBe(3);
    expect(stats.average).toBeCloseTo((5 * 2 + 4 * 1) / 3, 1);
  });

  it('returns zeroed stats when there are no reviews', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]));

    const stats = await getBlogReviewStats('post-1');

    expect(stats).toEqual({ total: 0, average: 0, distribution: [] });
  });
});

describe('getBlogNotifications', () => {
  it('lists notifications for the requesting user, most recent first', async () => {
    const rows = [
      { notification: { id: 'n1', userId: 'user-1', isRead: false, createdAt: new Date() }, post: { id: 'post-1', slug: 'titre' }, fromUser: null },
    ];
    mockSelect.mockReturnValueOnce(makeChain(rows));

    const result = await getBlogNotifications('user-1', { limit: 10 });

    expect(result).toEqual(rows);
  });

  it('can filter notifications by organization through their resolved post target', async () => {
    const chain = makeChain([]);
    mockSelect.mockReturnValueOnce(chain);

    await getBlogNotifications('user-1', { limit: 10, organizationId: 'org-1' });

    expect(chain.leftJoin).toHaveBeenCalledTimes(4);
    expect(chain.where).toHaveBeenCalledOnce();
  });
});

describe('getUnreadBlogNotificationCount', () => {
  it('returns the unread count for a user', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ value: 4 }]));

    const count = await getUnreadBlogNotificationCount('user-1');

    expect(count).toBe(4);
  });
});

describe('getBlogModerationQueue', () => {
  it('left-joins report subjects so indirect comment and review reports are returned', async () => {
    const commentsChain = makeChain([]);
    const reviewsChain = makeChain([]);
    const reportsChain = makeChain([]);
    mockSelect
      .mockReturnValueOnce(commentsChain)
      .mockReturnValueOnce(reviewsChain)
      .mockReturnValueOnce(reportsChain);

    const result = await getBlogModerationQueue(null);

    expect(result).toEqual({ comments: [], reviews: [], reports: [] });
    expect(reportsChain.leftJoin).toHaveBeenCalledTimes(4);
    expect(reportsChain.innerJoin).not.toHaveBeenCalled();
  });
});
