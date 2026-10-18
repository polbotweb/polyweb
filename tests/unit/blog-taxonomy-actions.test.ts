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

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => {
    const db = { select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete };
    return { ...db, transaction: (callback: (tx: typeof db) => Promise<unknown>) => callback(db) };
  }),
}));

vi.mock('@database/schemas', () => ({
  blogCategories: { id: 'id', organizationId: 'organizationId', slug: 'slug', parentId: 'parentId' },
  blogCategoryTranslations: { id: 'id', categoryId: 'categoryId', locale: 'locale', slug: 'slug' },
  blogPostCategories: { postId: 'postId', categoryId: 'categoryId' },
  blogTags: { id: 'id', organizationId: 'organizationId', slug: 'slug' },
  blogTagTranslations: { id: 'id', tagId: 'tagId', locale: 'locale', slug: 'slug' },
  blogPostTags: { postId: 'postId', tagId: 'tagId' },
}));

vi.mock('@database/cache', () => ({ invalidateCache: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));
vi.mock('@i18n/config', () => ({ LOCALES: ['fr', 'en', 'es', 'ar'] as const, DEFAULT_LOCALE: 'fr' }));
const mockUserHasPermission = vi.fn(() => Promise.resolve({ success: true }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getFullOrganization: vi.fn(), userHasPermission: mockUserHasPermission } },
}));

// ── Imports ─────────────────────────────────────────────────────────
import { createBlogCategory, updateBlogCategory, deleteBlogCategory } from '@/actions/blog/category';
import { createBlogTag, updateBlogTag, deleteBlogTag } from '@/actions/blog/tag';

const createCategory = createBlogCategory as unknown as { handler: (...a: any[]) => Promise<any> };
const updateCategory = updateBlogCategory as unknown as { handler: (...a: any[]) => Promise<any> };
const deleteCategory = deleteBlogCategory as unknown as { handler: (...a: any[]) => Promise<any> };
const createTag = createBlogTag as unknown as { handler: (...a: any[]) => Promise<any> };
const updateTag = updateBlogTag as unknown as { handler: (...a: any[]) => Promise<any> };
const deleteTag = deleteBlogTag as unknown as { handler: (...a: any[]) => Promise<any> };

function adminCtx() {
  return {
    locals: { user: { id: 'admin-1', role: 'admin', banned: false }, session: { id: 'sess-1' } },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  } as any;
}

function makeChain(rows: any[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => resolve(rows),
  };
  return chain;
}

function makeMutationChain(returningRows: any[] = []) {
  const chain: any = {
    values: vi.fn(() => chain),
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    onConflictDoNothing: vi.fn(() => Promise.resolve(undefined)),
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
  mockUserHasPermission.mockReset().mockResolvedValue({ success: true });
});

describe('createBlogCategory', () => {
  it('creates a category when the slug is available', async () => {
    mockSelect
      .mockReturnValueOnce(makeChain([])) // base slug check: no collision
      .mockReturnValueOnce(makeChain([])); // localized slug check: no collision
    mockInsert.mockReturnValue(makeMutationChain([{ id: 'cat-1' }]));

    const result = await createCategory.handler(
      { locale: 'fr', name: 'Voyage', slug: 'voyage', organizationId: null },
      adminCtx(),
    );

    expect(result).toEqual({ id: 'cat-1', slug: 'voyage' });
  });

  it('rejects a duplicate base slug in the same tenant', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'existing-cat' }]));

    await expect(
      createCategory.handler({ locale: 'fr', name: 'Voyage', slug: 'voyage', organizationId: null }, adminCtx()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('updateBlogCategory', () => {
  it('rejects updating a category from another tenant', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'cat-1', organizationId: 'org-9' }]));

    await expect(
      updateCategory.handler({ id: 'cat-1', organizationId: null, name: 'x' }, adminCtx()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('updates a category in the same tenant', async () => {
    mockSelect
      .mockReturnValueOnce(makeChain([{ id: 'cat-1', organizationId: null }])) // assertCategoryInTenant
      .mockReturnValueOnce(makeChain([])); // existing translation lookup
    mockUpdate.mockReturnValue(makeMutationChain());
    mockInsert.mockReturnValue(makeMutationChain());

    const result = await updateCategory.handler(
      { id: 'cat-1', organizationId: null, locale: 'fr', name: 'Nouveau nom' },
      adminCtx(),
    );

    expect(result).toEqual({ id: 'cat-1' });
  });
});

describe('deleteBlogCategory', () => {
  it('reassigns posts to another category before deleting', async () => {
    mockSelect
      .mockReturnValueOnce(makeChain([{ id: 'cat-1', organizationId: null }])) // assertCategoryInTenant (target)
      .mockReturnValueOnce(makeChain([{ id: 'cat-2', organizationId: null }])) // assertCategoryInTenant (reassignTo)
      .mockReturnValueOnce(makeChain([{ postId: 'post-1' }])); // affected post-category relations
    const insertChain = makeMutationChain();
    mockInsert.mockReturnValue(insertChain);
    mockDelete.mockReturnValue(makeMutationChain());

    const result = await deleteCategory.handler(
      { id: 'cat-1', organizationId: null, reassignToId: 'cat-2' },
      adminCtx(),
    );

    expect(result).toEqual({ success: true });
    expect(insertChain.values).toHaveBeenCalledWith([{ postId: 'post-1', categoryId: 'cat-2' }]);
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });
});

describe('createBlogTag', () => {
  it('creates a tag when the slug is available', async () => {
    mockSelect.mockReturnValueOnce(makeChain([])).mockReturnValueOnce(makeChain([]));
    mockInsert.mockReturnValue(makeMutationChain([{ id: 'tag-1' }]));

    const result = await createTag.handler({ locale: 'fr', name: 'Randonnée', slug: 'randonnee', organizationId: null }, adminCtx());

    expect(result).toEqual({ id: 'tag-1', slug: 'randonnee' });
  });

  it('rejects a duplicate slug', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'existing-tag' }]));

    await expect(
      createTag.handler({ locale: 'fr', name: 'Randonnée', slug: 'randonnee', organizationId: null }, adminCtx()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('updateBlogTag', () => {
  it('rejects updating a tag from another tenant', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'tag-1', organizationId: 'org-9' }]));

    await expect(
      updateTag.handler({ id: 'tag-1', organizationId: null, name: 'x' }, adminCtx()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('deleteBlogTag', () => {
  it('deletes tag associations then the tag itself', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'tag-1', organizationId: null }]));
    mockDelete.mockReturnValue(makeMutationChain());

    const result = await deleteTag.handler({ id: 'tag-1', organizationId: null }, adminCtx());

    expect(result).toEqual({ success: true });
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });
});
