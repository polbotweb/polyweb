import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────
vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  }
  return { ActionError, defineAction: (def: any) => def };
});

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => {
    const db = {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      execute: vi.fn(() => Promise.resolve()),
    };
    return { ...db, transaction: (cb: (tx: typeof db) => Promise<any>) => mockTransaction(cb, db) };
  }),
}));

vi.mock('@database/schemas', () => ({
  blogPosts: { id: 'id', organizationId: 'organizationId', commentStatus: 'commentStatus', allowReviews: 'allowReviews', authorId: 'authorId', slug: 'slug', viewCount: 'viewCount', status: 'status', publishedAt: 'publishedAt' },
  blogComments: { id: 'id', postId: 'postId', parentId: 'parentId', authorId: 'authorId', status: 'status', content: 'content', createdAt: 'createdAt' },
  blogCommentModerations: { id: 'id', commentId: 'commentId' },
  blogPostReviews: { id: 'id', postId: 'postId', authorId: 'authorId', status: 'status', rating: 'rating', helpfulCount: 'helpfulCount', createdAt: 'createdAt' },
  blogPostReviewHelpful: { reviewId: 'reviewId', userId: 'userId', isHelpful: 'isHelpful' },
  blogPostReactions: { postId: 'postId', userId: 'userId', reactionType: 'reactionType' },
  blogPostFavorites: { postId: 'postId', userId: 'userId' },
  blogReports: { id: 'id', postId: 'postId', commentId: 'commentId', reviewId: 'reviewId', status: 'status', reporterId: 'reporterId', createdAt: 'createdAt' },
  blogNotifications: { id: 'id', userId: 'userId', isRead: 'isRead', postId: 'postId', commentId: 'commentId', reviewId: 'reviewId', fromUserId: 'fromUserId', createdAt: 'createdAt' },
  blogPostViewStats: { id: 'id', postId: 'postId' },
}));

vi.mock('@database/cache', () => ({ invalidateCache: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '203.0.113.7'),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));
vi.mock('@i18n/config', () => ({ LOCALES: ['fr', 'en', 'es', 'ar'] as const }));
const mockUserHasPermission = vi.fn(() => Promise.resolve({ success: true }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getFullOrganization: vi.fn(), userHasPermission: mockUserHasPermission } },
}));

// ── Imports ─────────────────────────────────────────────────────────
import { createBlogComment, moderateBlogComment } from '@/actions/blog/comment';
import { createBlogReview, moderateBlogReview, voteBlogReviewHelpful } from '@/actions/blog/review';
import { toggleBlogReaction, toggleBlogFavorite } from '@/actions/blog/reaction';
import { createBlogReport, getBlogModerationQueue } from '@/actions/blog/moderation';
import { recordBlogPostView } from '@/actions/blog/view';
import { markBlogNotificationRead, markAllBlogNotificationsRead } from '@/actions/blog/notification';
import { checkRateLimit } from '@/lib/rate-limit';

const createComment = createBlogComment as unknown as { handler: (...a: any[]) => Promise<any> };
const moderateComment = moderateBlogComment as unknown as { handler: (...a: any[]) => Promise<any> };
const createReview = createBlogReview as unknown as { handler: (...a: any[]) => Promise<any> };
const moderateReview = moderateBlogReview as unknown as { handler: (...a: any[]) => Promise<any> };
const voteHelpful = voteBlogReviewHelpful as unknown as { handler: (...a: any[]) => Promise<any> };
const toggleReaction = toggleBlogReaction as unknown as { handler: (...a: any[]) => Promise<any> };
const toggleFavorite = toggleBlogFavorite as unknown as { handler: (...a: any[]) => Promise<any> };
const createReport = createBlogReport as unknown as { handler: (...a: any[]) => Promise<any> };
const moderationQueue = getBlogModerationQueue as unknown as { handler: (...a: any[]) => Promise<any> };
const recordView = recordBlogPostView as unknown as { handler: (...a: any[]) => Promise<any> };
const markRead = markBlogNotificationRead as unknown as { handler: (...a: any[]) => Promise<any> };
const markAllRead = markAllBlogNotificationsRead as unknown as { handler: (...a: any[]) => Promise<any> };

function guestCtx() {
  const cookies = new Map<string, string>();
  return {
    locals: {},
    request: { headers: new Headers() },
    clientAddress: '203.0.113.7',
    cookies: {
      get: (name: string) => (cookies.has(name) ? { value: cookies.get(name) } : undefined),
      set: (name: string, value: string) => {
        cookies.set(name, value);
      },
    },
  } as any;
}
function userCtx(id = 'user-1') {
  return {
    locals: { user: { id, banned: false }, session: { id: 'sess-1' } },
    request: { headers: new Headers() },
    clientAddress: '203.0.113.7',
  } as any;
}
function adminCtx() {
  return {
    locals: { user: { id: 'admin-1', role: 'admin', banned: false }, session: { id: 'sess-1' } },
    request: { headers: new Headers() },
    clientAddress: '203.0.113.7',
  } as any;
}

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
function makeMutationChain(returningRows: any[] = []) {
  const chain: any = {
    values: vi.fn(() => chain),
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    onConflictDoUpdate: vi.fn(() => Promise.resolve(undefined)),
    returning: vi.fn(() => Promise.resolve(returningRows)),
    then: (resolve: any) => resolve(undefined),
  };
  return chain;
}

beforeEach(() => {
  mockSelect.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockTransaction.mockReset().mockImplementation(
    (callback: (tx: any) => Promise<any>, db: any) => callback(db),
  );
  mockUserHasPermission.mockReset().mockResolvedValue({ success: true });
  vi.mocked(checkRateLimit).mockReset().mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 });
});

describe('createBlogComment', () => {
  it('rejects when comments are disabled on the post', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'post-1', commentStatus: 'DISABLED', organizationId: null }]));

    await expect(
      createComment.handler({ postId: 'post-1', content: 'Hello there' }, guestCtx()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows a guest comment and sanitizes its content', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'post-1', commentStatus: 'OPEN', organizationId: null }]));
    const insertChain = makeMutationChain([{ id: 'comment-1', status: 'PENDING' }]);
    mockInsert.mockReturnValue(insertChain);

    const result = await createComment.handler(
      { postId: 'post-1', content: 'Nice post!<script>alert(1)</script>', guestName: 'Ana', guestEmail: 'ana@example.com' },
      guestCtx(),
    );

    expect(result).toEqual({ id: 'comment-1', status: 'PENDING' });
    const insertedValues = insertChain.values.mock.calls[0][0];
    expect(insertedValues.content).not.toContain('<script>');
  });

  it('rejects comments on posts that are not publicly visible', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]));

    await expect(
      createComment.handler({ postId: 'post-1', content: 'Not public' }, guestCtx()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects a parent comment outside the same public post', async () => {
    mockSelect
      .mockReturnValueOnce(makeChain([{ id: 'post-1', commentStatus: 'OPEN' }]))
      .mockReturnValueOnce(makeChain([]));

    await expect(
      createComment.handler({ postId: 'post-1', parentId: 'comment-other-post', content: 'Reply' }, guestCtx()),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('allows one reply level below an approved root comment', async () => {
    mockSelect
      .mockReturnValueOnce(makeChain([{ id: 'post-1', commentStatus: 'OPEN' }]))
      .mockReturnValueOnce(makeChain([{ parentId: null }]));
    mockInsert.mockReturnValue(makeMutationChain([{ id: 'reply-1', status: 'PENDING' }]));

    const result = await createComment.handler(
      { postId: 'post-1', parentId: 'comment-1', content: 'Reply' },
      guestCtx(),
    );

    expect(result).toEqual({ id: 'reply-1', status: 'PENDING' });
  });

  it('caps replies at the single level rendered by public loaders', async () => {
    mockSelect
      .mockReturnValueOnce(makeChain([{ id: 'post-1', commentStatus: 'OPEN' }]))
      .mockReturnValueOnce(makeChain([{ parentId: 'comment-2' }]))
      .mockReturnValueOnce(makeChain([{ parentId: null }]));

    await expect(
      createComment.handler({ postId: 'post-1', parentId: 'comment-1', content: 'Too deep' }, guestCtx()),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('is rate-limited per IP for guests', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 });

    await expect(
      createComment.handler({ postId: 'post-1', content: 'spam' }, guestCtx()),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });

    expect(mockSelect).not.toHaveBeenCalled();
  });
});

describe('moderateBlogComment', () => {
  it('approves a pending comment', async () => {
    mockSelect.mockReturnValueOnce(
      makeChain([{ id: 'comment-1', postId: 'post-1', parentId: null, authorId: null, postAuthorId: 'admin-1', content: 'hi', status: 'PENDING' }]),
    );
    const updateChain = makeMutationChain();
    mockUpdate.mockReturnValue(updateChain);
    mockInsert.mockReturnValue(makeMutationChain());

    const result = await moderateComment.handler(
      { commentId: 'comment-1', moderationAction: 'APPROVE', organizationId: null },
      adminCtx(),
    );

    expect(result).toEqual({ success: true });
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'APPROVED' }));
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it('creates a single-target approval notification inside the moderation transaction', async () => {
    mockSelect.mockReturnValueOnce(
      makeChain([{ id: 'comment-1', postId: 'post-1', parentId: null, authorId: 'author-1', postAuthorId: 'admin-1', content: 'hi', status: 'PENDING' }]),
    );
    mockUpdate.mockReturnValue(makeMutationChain());
    const moderationInsert = makeMutationChain();
    const notificationInsert = makeMutationChain();
    mockInsert
      .mockReturnValueOnce(moderationInsert)
      .mockReturnValueOnce(notificationInsert);

    await moderateComment.handler(
      { commentId: 'comment-1', moderationAction: 'APPROVE', organizationId: null },
      adminCtx(),
    );

    expect(notificationInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'COMMENT_APPROVED', commentId: 'comment-1' }),
    );
    expect(notificationInsert.values.mock.calls[0][0]).not.toHaveProperty('postId');
    expect(mockTransaction).toHaveBeenCalledOnce();
  });
});

describe('createBlogReview', () => {
  it('requires authentication', async () => {
    await expect(
      createReview.handler({ postId: 'post-1', rating: 5, content: 'Great read' }, guestCtx()),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  describe('moderateBlogReview', () => {
    it('updates and notifies atomically when approving a review', async () => {
      mockSelect.mockReturnValueOnce(makeChain([{ id: 'review-1', authorId: 'reviewer-1', status: 'PENDING' }]));
      mockUpdate.mockReturnValue(makeMutationChain());
      const notificationInsert = makeMutationChain();
      mockInsert.mockReturnValue(notificationInsert);

      const result = await moderateReview.handler(
        { reviewId: 'review-1', status: 'APPROVED', organizationId: null },
        adminCtx(),
      );

      expect(result).toEqual({ success: true });
      expect(mockTransaction).toHaveBeenCalledOnce();
      expect(notificationInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REVIEW_APPROVED', reviewId: 'review-1' }),
      );
      expect(notificationInsert.values.mock.calls[0][0]).not.toHaveProperty('postId');
    });

    it('does not mislabel a rejected review as a rejected comment', async () => {
      mockSelect.mockReturnValueOnce(makeChain([{ id: 'review-1', authorId: 'reviewer-1', status: 'PENDING' }]));
      mockUpdate.mockReturnValue(makeMutationChain());

      await moderateReview.handler(
        { reviewId: 'review-1', status: 'REJECTED', organizationId: null },
        adminCtx(),
      );

      expect(mockTransaction).toHaveBeenCalledOnce();
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  it('rejects when reviews are disabled', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'post-1', allowReviews: false }]));

    await expect(
      createReview.handler({ postId: 'post-1', rating: 5, content: 'Great read' }, userCtx()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('sanitizes review content before persisting (defense in depth)', async () => {
    mockSelect
      .mockReturnValueOnce(makeChain([{ id: 'post-1', allowReviews: true, authorId: 'post-author' }]));
    const insertChain = makeMutationChain([{ id: 'review-1', status: 'PENDING' }]);
    mockInsert.mockReturnValue(insertChain);

    await createReview.handler(
      { postId: 'post-1', rating: 4, content: 'Nice<script>alert(1)</script>' },
      userCtx(),
    );

    const insertedValues = insertChain.values.mock.calls[0][0];
    expect(insertedValues.content).not.toContain('<script>');
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it('rejects reviews on posts that are not publicly visible', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]));

    await expect(
      createReview.handler({ postId: 'post-1', rating: 5, content: 'Future post' }, userCtx()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('is rate-limited per user', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 });
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'post-1', allowReviews: true }]));

    await expect(
      createReview.handler({ postId: 'post-1', rating: 5, content: 'Great read' }, userCtx()),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });
});

describe('voteBlogReviewHelpful', () => {
  it('records a helpful vote and recalculates the count', async () => {
    mockInsert.mockReturnValue(makeMutationChain());
    mockSelect
      .mockReturnValueOnce(makeChain([{ id: 'review-1' }]))
      .mockReturnValueOnce(makeChain([{ helpful: 3 }]));
    mockUpdate.mockReturnValue(makeMutationChain());

    const result = await voteHelpful.handler({ reviewId: 'review-1', isHelpful: true }, userCtx());

    expect(result).toEqual({ success: true });
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it('requires authentication', async () => {
    await expect(
      voteHelpful.handler({ reviewId: 'review-1', isHelpful: true }, guestCtx()),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects a helpful vote when its review is not on a public post', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]));

    await expect(
      voteHelpful.handler({ reviewId: 'review-1', isHelpful: true }, userCtx()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('toggleBlogReaction', () => {
  it('adds a reaction when none exists yet', async () => {
    mockSelect
      .mockReturnValueOnce(makeChain([{ id: 'post-1' }]))
      .mockReturnValueOnce(makeChain([])) // no existing reaction
      .mockReturnValueOnce(makeChain([{ value: 1 }])); // updated count
    mockInsert.mockReturnValue(makeMutationChain());

    const result = await toggleReaction.handler({ postId: 'post-1', reactionType: 'LIKE' }, userCtx());

    expect(result).toEqual({ active: true, count: 1 });
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it('removes an existing reaction (toggle off)', async () => {
    mockSelect
      .mockReturnValueOnce(makeChain([{ id: 'post-1' }]))
      .mockReturnValueOnce(makeChain([{ postId: 'post-1', userId: 'user-1', reactionType: 'LIKE' }]))
      .mockReturnValueOnce(makeChain([{ value: 0 }]));
    mockDelete.mockReturnValue(makeMutationChain());

    const result = await toggleReaction.handler({ postId: 'post-1', reactionType: 'LIKE' }, userCtx());

    expect(result).toEqual({ active: false, count: 0 });
  });

  it('is rate-limited per user', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 });

    await expect(
      toggleReaction.handler({ postId: 'post-1', reactionType: 'LIKE' }, userCtx()),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('rejects reactions on posts that are not publicly visible', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]));

    await expect(
      toggleReaction.handler({ postId: 'post-1', reactionType: 'LIKE' }, userCtx()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('toggleBlogFavorite', () => {
  it('requires authentication', async () => {
    await expect(
      toggleFavorite.handler({ postId: 'post-1' }, guestCtx()),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('is rate-limited per user', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 });

    await expect(
      toggleFavorite.handler({ postId: 'post-1' }, userCtx()),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('rejects favorites on posts that are not publicly visible', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]));

    await expect(
      toggleFavorite.handler({ postId: 'post-1' }, userCtx()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('createBlogReport', () => {
  it('accepts an anonymous report and is rate-limited per IP', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'post-1' }]));
    mockInsert.mockReturnValue(makeMutationChain([{ id: 'report-1' }]));

    const result = await createReport.handler({ postId: 'post-1', reason: 'SPAM' }, guestCtx());

    expect(result).toEqual({ id: 'report-1' });
  });

  describe('getBlogModerationQueue', () => {
    it('left-joins report targets so comment and review reports remain visible', async () => {
      const commentsChain = makeChain([]);
      const reviewsChain = makeChain([]);
      const reportsChain = makeChain([]);
      mockSelect
        .mockReturnValueOnce(commentsChain)
        .mockReturnValueOnce(reviewsChain)
        .mockReturnValueOnce(reportsChain);

      const result = await moderationQueue.handler(
        { organizationId: null, page: 1, limit: 20 },
        adminCtx(),
      );

      expect(result).toEqual({ comments: [], reviews: [], reports: [] });
      expect(reportsChain.leftJoin).toHaveBeenCalledTimes(3);
      expect(reportsChain.innerJoin).not.toHaveBeenCalled();
    });
  });

  it('rejects reports for subjects that are not publicly visible', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]));

    await expect(
      createReport.handler({ commentId: 'comment-1', reason: 'SPAM' }, guestCtx()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects inconsistent report targets even when called without action parsing', async () => {
    await expect(
      createReport.handler({ postId: 'post-1', reviewId: 'review-1', reason: 'SPAM' }, guestCtx()),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('rejects when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 });

    await expect(
      createReport.handler({ postId: 'post-1', reason: 'SPAM' }, guestCtx()),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });

    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe('recordBlogPostView', () => {
  it('increments the view counter and logs a view stat row', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'post-1' }]));
    mockUpdate.mockReturnValue(makeMutationChain([{ id: 'post-1' }]));
    mockInsert.mockReturnValue(makeMutationChain());

    const result = await recordView.handler({ postId: 'post-1', referrer: 'https://example.com' }, guestCtx());

    expect(result).toEqual({ recorded: true });
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it('de-duplicates repeat views from the same IP within the cooldown window', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'post-1' }]));
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 });

    const result = await recordView.handler({ postId: 'post-1' }, guestCtx());

    expect(result).toEqual({ recorded: false });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects an unknown post', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]));

    await expect(recordView.handler({ postId: 'post-1' }, guestCtx())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('notifications', () => {
  it('markBlogNotificationRead requires authentication', async () => {
    await expect(markRead.handler({ id: 'notif-1' }, guestCtx())).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('markBlogNotificationRead marks a notification read for the requesting user only', async () => {
    const updateChain = makeMutationChain();
    mockUpdate.mockReturnValue(updateChain);

    const result = await markRead.handler({ id: 'notif-1' }, userCtx('user-1'));

    expect(result).toEqual({ success: true });
    expect(updateChain.set).toHaveBeenCalledWith({ isRead: true });
  });

  it('markAllBlogNotificationsRead requires authentication', async () => {
    await expect(markAllRead.handler({}, guestCtx())).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('markAllBlogNotificationsRead marks every unread notification as read', async () => {
    mockUpdate.mockReturnValue(makeMutationChain());

    const result = await markAllRead.handler({}, userCtx('user-1'));

    expect(result).toEqual({ success: true });
  });
});
