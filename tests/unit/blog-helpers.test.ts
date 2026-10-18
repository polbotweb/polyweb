import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  }

  return { ActionError };
});

const mockSelect = vi.fn();
const mockGetFullOrganization = vi.fn();
const mockUserHasPermission = vi.fn();
const mockHasPermission = vi.fn();

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: mockSelect,
  })),
}));

vi.mock('@database/schemas', () => ({
  blogPosts: { id: 'id', organizationId: 'organizationId' },
  blogCategories: { id: 'id', organizationId: 'organizationId' },
  blogTags: { id: 'id', organizationId: 'organizationId' },
  mediaFiles: { id: 'id', organizationId: 'organizationId' },
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getFullOrganization: mockGetFullOrganization,
      userHasPermission: mockUserHasPermission,
      hasPermission: mockHasPermission,
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));
vi.mock('@database/cache', () => ({ invalidateCache: vi.fn() }));

import {
  assertBlogPermission,
  assertCategoryInTenant,
  assertMediaInTenant,
  assertPostInTenant,
  assertTagInTenant,
  hasBlogPermission,
  invalidateBlogCache,
  resolveBlogTenant,
} from '@/actions/blog/_helpers';
import { invalidateCache } from '@database/cache';

function fakeContext(user: any = null): any {
  return {
    locals: { user },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  };
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
  mockSelect.mockReset();
  mockGetFullOrganization.mockReset();
  mockUserHasPermission.mockReset();
  mockHasPermission.mockReset();
  mockUserHasPermission.mockResolvedValue({ success: true });
  mockHasPermission.mockResolvedValue({ success: true });
});

describe('resolveBlogTenant', () => {
  it('returns global context when organizationId is missing', () => {
    expect(resolveBlogTenant({})).toEqual({
      organizationId: null,
      isOrgContext: false,
    });
  });

  it('returns org context when organizationId is present', () => {
    expect(resolveBlogTenant({ organizationId: 'org-1' })).toEqual({
      organizationId: 'org-1',
      isOrgContext: true,
    });
  });
});

describe('assertBlogPermission', () => {
  it('throws UNAUTHORIZED when user is missing', async () => {
    await expect(
      assertBlogPermission(fakeContext(null), { organizationId: null, isOrgContext: false }, { blog: ['read'] }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('checks global permissions without an implicit admin bypass', async () => {
    const user = { id: 'admin-1', role: 'admin', banned: false };

    const result = await assertBlogPermission(
      fakeContext(user),
      { organizationId: null, isOrgContext: false },
      { blog: ['delete'] },
    );

    expect(result).toBe(user);
    expect(mockGetFullOrganization).not.toHaveBeenCalled();
    expect(mockUserHasPermission).toHaveBeenCalledWith({
      body: {
        userId: 'admin-1',
        permissions: { blog: ['delete'] },
      },
    });
  });

  it('rejects when Better Auth denies the organization permission', async () => {
    mockHasPermission.mockResolvedValueOnce({ success: false });

    await expect(
      assertBlogPermission(
        fakeContext({ id: 'user-1', role: 'user', banned: false }),
        { organizationId: 'org-1', isOrgContext: true },
        { blog: ['update'] },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(mockUserHasPermission).not.toHaveBeenCalled();
  });

  it('uses the session-scoped organization permission endpoint', async () => {
    const user = { id: 'user-1', role: 'user', banned: false };
    const context = fakeContext(user);
    const result = await assertBlogPermission(
      context,
      { organizationId: 'org-1', isOrgContext: true },
      { blog: ['publish'] },
    );

    expect(result).toBe(user);
    expect(mockHasPermission).toHaveBeenCalledWith({
      headers: context.request.headers,
      body: {
        organizationId: 'org-1',
        permissions: { blog: ['publish'] },
      },
    });
    expect(mockUserHasPermission).not.toHaveBeenCalled();
  });

  it('rejects when RBAC denies the requested blog permission', async () => {
    mockUserHasPermission.mockResolvedValueOnce({ success: false });

    await expect(
      assertBlogPermission(
        fakeContext({ id: 'editor-1', role: 'editor', banned: false }),
        { organizationId: null, isOrgContext: false },
        { blogReview: ['moderate'] },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns false instead of throwing when a capability lookup fails', async () => {
    mockHasPermission.mockRejectedValueOnce(new Error('auth unavailable'));

    await expect(
      hasBlogPermission(
        fakeContext({ id: 'user-1', role: 'user', banned: false }),
        { organizationId: 'org-1', isOrgContext: true },
        { blog: ['read'] },
      ),
    ).resolves.toBe(false);
  });
});

describe('tenant resource guards', () => {
  it('allows a post when its tenant matches', async () => {
    const row = { id: 'post-1', organizationId: 'org-1' };
    mockSelect.mockReturnValueOnce(selectChain([row]));

    await expect(
      assertPostInTenant('post-1', { organizationId: 'org-1', isOrgContext: true }),
    ).resolves.toEqual(row);
  });

  it('rejects a post from another tenant', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'post-2', organizationId: 'org-2' }]));

    await expect(
      assertPostInTenant('post-2', { organizationId: 'org-1', isOrgContext: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows a global category in the global tenant', async () => {
    const row = { id: 'cat-1', organizationId: null };
    mockSelect.mockReturnValueOnce(selectChain([row]));

    await expect(
      assertCategoryInTenant('cat-1', { organizationId: null, isOrgContext: false }),
    ).resolves.toEqual(row);
  });

  it('rejects an org tag from the global tenant', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'tag-1', organizationId: 'org-9' }]));

    await expect(
      assertTagInTenant('tag-1', { organizationId: null, isOrgContext: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects media from another tenant', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'media-1', organizationId: 'org-2' }]));

    await expect(
      assertMediaInTenant('media-1', { organizationId: 'org-1', isOrgContext: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('invalidateBlogCache', () => {
  it('invalidates slug and internal-link target caches', () => {
    invalidateBlogCache();

    expect(invalidateCache).toHaveBeenCalledWith('blog:slugs:');
    expect(invalidateCache).toHaveBeenCalledWith('blog:link-targets:');
  });
});