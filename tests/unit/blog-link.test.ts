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
const { mockListValidTargets } = vi.hoisted(() => ({
  mockListValidTargets: vi.fn(),
}));

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  })),
}));

vi.mock('@database/schemas', () => ({
  blogPostLinks: { id: 'id', sourcePostId: 'sourcePostId', targetPostId: 'targetPostId' },
  blogPosts: { id: 'id', organizationId: 'organizationId', status: 'status' },
  blogPostTranslations: {
    id: 'id',
    postId: 'postId',
    organizationId: 'organizationId',
    locale: 'locale',
    content: 'content',
    slug: 'slug',
  },
  blogCategories: { id: 'id', organizationId: 'organizationId' },
  blogTags: { id: 'id', organizationId: 'organizationId' },
  mediaFiles: { id: 'id', organizationId: 'organizationId' },
}));

vi.mock('@database/cache', () => ({ invalidateCache: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));
vi.mock('@i18n/config', () => ({ LOCALES: ['fr', 'en', 'es', 'ar'] as const }));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      userHasPermission: vi.fn(() => Promise.resolve({ success: true })),
      hasPermission: vi.fn(() => Promise.resolve({ success: true })),
      getFullOrganization: vi.fn(() => Promise.resolve({ members: [] })),
    },
  },
}));
vi.mock('@/lib/blog/blog-internal-link', () => ({
  blogInternalLinkResolver: {
    listValidTargets: mockListValidTargets,
  },
}));

import { createBlogLink, updateBlogLink, deleteBlogLink } from '@/actions/blog/link';
import { checkBlogPostLinks } from '@/actions/blog/check-links';

const create = createBlogLink as unknown as { handler: (...a: any[]) => Promise<any> };
const update = updateBlogLink as unknown as { handler: (...a: any[]) => Promise<any> };
const del = deleteBlogLink as unknown as { handler: (...a: any[]) => Promise<any> };
const check = checkBlogPostLinks as unknown as { handler: (...a: any[]) => Promise<any> };

function adminCtx() {
  return {
    locals: { user: { id: 'admin-1', role: 'admin', email: 'a@test.com', banned: false } },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  } as any;
}

function selectChain(rows: any[]) {
  const terminal: any = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
  });
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(terminal),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelect.mockImplementation(() => selectChain([{ id: 'post-1', organizationId: null }]));
  mockInsert.mockReturnValue({ values: () => ({ returning: () => Promise.resolve([{ id: 'link-1' }]) }) });
  mockUpdate.mockReturnValue({ set: () => ({ where: () => Promise.resolve([]) }) });
  mockDelete.mockReturnValue({ where: () => Promise.resolve([]) });
  mockListValidTargets.mockReset().mockResolvedValue(new Set<string>());
});

describe('checkBlogPostLinks', () => {
  it('rejects explicit self-links', async () => {
    mockSelect
      .mockImplementationOnce(() => selectChain([{ id: 'post-1', organizationId: null }]))
      .mockImplementationOnce(() => selectChain([
        { id: 'link-1', linkType: 'RELATED', targetPostId: 'post-1' },
      ]));

    await expect(
      check.handler({ postId: 'post-1', locale: 'fr', organizationId: null }, adminCtx()),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('reports an explicit target from another tenant as dead', async () => {
    mockSelect
      .mockImplementationOnce(() => selectChain([{ id: 'post-1', organizationId: 'org-1' }]))
      .mockImplementationOnce(() => selectChain([
        { id: 'link-1', linkType: 'RELATED', targetPostId: 'post-2' },
      ]))
      .mockImplementationOnce(() => selectChain([{ id: 'post-2', organizationId: 'org-2' }]))
      .mockImplementationOnce(() => selectChain([
        { content: '<p>Content</p>', slug: 'source-post' },
      ]));

    const result = await check.handler(
      { postId: 'post-1', locale: 'fr', organizationId: 'org-1' },
      adminCtx(),
    );

    expect(result.deadExplicit).toEqual([
      { id: 'link-1', linkType: 'RELATED', targetPostId: 'post-2' },
    ]);
  });
});

describe('blog link actions', () => {
  it('creates a link between two posts', async () => {
    const res = await create.handler(
      { sourcePostId: 'post-1', targetPostId: 'post-2', linkType: 'RELATED', sortOrder: 0, organizationId: null },
      adminCtx(),
    );
    expect(res.id).toBe('link-1');
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('updates a link', async () => {
    mockSelect.mockImplementation(() => selectChain([{ id: 'link-1', sourcePostId: 'post-1', targetPostId: 'post-1' }]));
    const res = await update.handler(
      { id: 'link-1', linkType: 'CROSS_REFERENCE', organizationId: null },
      adminCtx(),
    );
    expect(res.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('throws NOT_FOUND when updating a missing link', async () => {
    mockSelect.mockImplementation(() => selectChain([]));
    await expect(
      update.handler({ id: 'link-1', organizationId: null }, adminCtx()),
    ).rejects.toThrow();
  });

  it('deletes a link', async () => {
    mockSelect.mockImplementation(() => selectChain([{ id: 'link-1', sourcePostId: 'post-1', targetPostId: 'post-1' }]));
    const res = await del.handler({ id: 'link-1', organizationId: null }, adminCtx());
    expect(res.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
