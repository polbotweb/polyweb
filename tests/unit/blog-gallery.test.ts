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
  getDrizzle: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  })),
}));

vi.mock('@database/schemas', () => ({
  blogPostGalleries: { id: 'id', postId: 'postId' },
  blogPostGalleryMedia: { id: 'id', galleryId: 'galleryId', mediaId: 'mediaId' },
  blogPosts: { id: 'id', organizationId: 'organizationId' },
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

import {
  createBlogGallery,
  updateBlogGallery,
  deleteBlogGallery,
  addGalleryMedia,
  removeGalleryMedia,
} from '@/actions/blog/gallery';

const create = createBlogGallery as unknown as { handler: (...a: any[]) => Promise<any> };
const update = updateBlogGallery as unknown as { handler: (...a: any[]) => Promise<any> };
const del = deleteBlogGallery as unknown as { handler: (...a: any[]) => Promise<any> };
const addMedia = addGalleryMedia as unknown as { handler: (...a: any[]) => Promise<any> };
const removeMedia = removeGalleryMedia as unknown as { handler: (...a: any[]) => Promise<any> };

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
  mockInsert.mockReturnValue({ values: () => ({ returning: () => Promise.resolve([{ id: 'gal-1' }]) }) });
  mockUpdate.mockReturnValue({ set: () => ({ where: () => Promise.resolve([]) }) });
  mockDelete.mockReturnValue({ where: () => Promise.resolve([]) });
});

describe('blog gallery actions', () => {
  it('creates a gallery for a post', async () => {
    const res = await create.handler(
      { postId: 'post-1', title: 'Mes photos', sortOrder: 0, organizationId: null },
      adminCtx(),
    );
    expect(res.id).toBe('gal-1');
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('updates a gallery', async () => {
    mockSelect.mockImplementation(() => selectChain([{ id: 'gal-1', postId: 'post-1' }]));
    const res = await update.handler(
      { id: 'gal-1', title: 'Nouveau titre', organizationId: null },
      adminCtx(),
    );
    expect(res.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('throws NOT_FOUND when updating a missing gallery', async () => {
    mockSelect.mockImplementation(() => selectChain([]));
    await expect(
      update.handler({ id: 'gal-1', organizationId: null }, adminCtx()),
    ).rejects.toThrow();
  });

  it('deletes a gallery', async () => {
    mockSelect.mockImplementation(() => selectChain([{ id: 'gal-1', postId: 'post-1' }]));
    const res = await del.handler({ id: 'gal-1', organizationId: null }, adminCtx());
    expect(res.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('adds media to a gallery', async () => {
    mockSelect
      .mockImplementationOnce(() => selectChain([{ id: 'gal-1', postId: 'post-1' }]))
      .mockImplementationOnce(() => selectChain([{ id: 'post-1', organizationId: null }]))
      .mockImplementationOnce(() => selectChain([{ id: 'media-1', organizationId: null }]));
    const res = await addMedia.handler(
      { galleryId: 'gal-1', mediaId: 'media-1', altText: 'alt', sortOrder: 0, organizationId: null },
      adminCtx(),
    );
    expect(res.success).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('rejects media belonging to another organization before insertion', async () => {
    mockSelect
      .mockImplementationOnce(() => selectChain([{ id: 'gal-1', postId: 'post-1' }]))
      .mockImplementationOnce(() => selectChain([{ id: 'post-1', organizationId: 'org-1' }]))
      .mockImplementationOnce(() => selectChain([{ id: 'media-1', organizationId: 'org-2' }]));

    await expect(
      addMedia.handler(
        { galleryId: 'gal-1', mediaId: 'media-1', altText: 'alt', sortOrder: 0, organizationId: 'org-1' },
        adminCtx(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('removes media from a gallery', async () => {
    mockSelect.mockImplementation(() => selectChain([{ id: 'gal-1', postId: 'post-1' }]));
    const res = await removeMedia.handler(
      { galleryId: 'gal-1', mediaId: 'media-1', organizationId: null },
      adminCtx(),
    );
    expect(res.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
