import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── DB Mock ─────────────────────────────────────────────────────────
const mockDb = {
  select: vi.fn(),
};

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => mockDb),
}));

vi.mock('@database/schemas', () => ({
  mediaFolders: { id: 'id', organizationId: 'organizationId', parentId: 'parentId', sortOrder: 'sortOrder', name: 'name' },
  mediaFiles: { id: 'id', organizationId: 'organizationId', folderId: 'folderId', createdAt: 'createdAt', size: 'size' },
  mediaFileAlts: { id: 'id', fileId: 'fileId' },
}));

// Bypass cache — invoke key function for coverage, then call inner fn
vi.mock('@database/cache', () => ({
  cached: (keyFn: any, fn: any) =>
    (...args: any[]) => { keyFn(...args); return fn(...args); },
}));

import {
  getMediaFolders,
  getMediaFoldersList,
  getMediaFilesByFolder,
  getMediaFile,
  getAllMediaFiles,
  getMediaFileCountsByFolder,
  getMediaStats,
} from '@/database/loaders/media.loader';

// ── Helpers ─────────────────────────────────────────────────────────

function selectChain(rows: any[]) {
  const terminal: any = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
    groupBy: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnValue(Object.assign(Promise.resolve(rows), { limit: vi.fn().mockResolvedValue(rows) })),
  });
  const fromResult: any = Object.assign(Promise.resolve(rows), {
    where: vi.fn().mockReturnValue(terminal),
    orderBy: vi.fn().mockReturnValue(terminal),
    limit: vi.fn().mockResolvedValue(rows),
    groupBy: vi.fn().mockResolvedValue(rows),
  });
  return {
    from: vi.fn().mockReturnValue(fromResult),
  };
}

beforeEach(() => {
  mockDb.select.mockReset();
});

// ─── getMediaFolders ────────────────────────────────────────────────

describe('getMediaFolders', () => {
  it('returns a hierarchical folder tree', async () => {
    const rows = [
      { id: 'f1', name: 'Photos', parentId: null, sortOrder: 0 },
      { id: 'f2', name: 'Sub', parentId: 'f1', sortOrder: 0 },
    ];
    mockDb.select.mockReturnValueOnce(selectChain(rows));

    const result = await getMediaFolders();
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].name).toBe('Sub');
  });

  it('returns empty array for no folders', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    const result = await getMediaFolders();
    expect(result).toEqual([]);
  });
});

// ─── getMediaFoldersList ────────────────────────────────────────────

describe('getMediaFoldersList', () => {
  it('returns flat folder list', async () => {
    const rows = [{ id: 'f1', name: 'A', parentId: null }];
    mockDb.select.mockReturnValueOnce(selectChain(rows));

    const result = await getMediaFoldersList();
    expect(result).toHaveLength(1);
  });
});

// ─── getMediaFilesByFolder ──────────────────────────────────────────

describe('getMediaFilesByFolder', () => {
  it('returns files with alts for a folder', async () => {
    const files = [{ id: 'file1', folderId: 'f1', filename: 'a.jpg', url: '/a.jpg', mimeType: 'image/jpeg', size: 100, width: 800, height: 600, createdAt: new Date() }];
    const alts = [{ fileId: 'file1', locale: 'fr', alt: 'Photo', title: null }];

    mockDb.select
      .mockReturnValueOnce(selectChain(files))
      .mockReturnValueOnce(selectChain(alts));

    const result = await getMediaFilesByFolder('f1');
    expect(result).toHaveLength(1);
    expect(result[0].alts).toHaveLength(1);
  });

  it('returns empty for empty folder', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    const result = await getMediaFilesByFolder('f1');
    expect(result).toEqual([]);
  });

  it('handles root folder (null)', async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ id: 'file1', folderId: null, filename: 'b.jpg', url: '/b.jpg', mimeType: 'image/jpeg', size: 50, width: null, height: null, createdAt: new Date() }]))
      .mockReturnValueOnce(selectChain([]));

    const result = await getMediaFilesByFolder(null);
    expect(result).toHaveLength(1);
    expect(result[0].alts).toEqual([]);
  });
});

// ─── getAllMediaFiles ───────────────────────────────────────────────

describe('getAllMediaFiles', () => {
  it('returns all files with alts', async () => {
    const files = [{ id: 'file1', folderId: null, filename: 'a.jpg', url: '/a.jpg', mimeType: 'image/jpeg', size: 100, width: null, height: null, createdAt: new Date() }];
    const alts = [{ fileId: 'file1', locale: 'en', alt: 'Alt', title: null }];

    mockDb.select
      .mockReturnValueOnce(selectChain(files))
      .mockReturnValueOnce(selectChain(alts));

    const result = await getAllMediaFiles();
    expect(result).toHaveLength(1);
    expect(result[0].alts).toHaveLength(1);
  });

  it('returns empty for no files', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    const result = await getAllMediaFiles();
    expect(result).toEqual([]);
  });
});

// ─── getMediaFile ───────────────────────────────────────────────────

describe('getMediaFile', () => {
  it('returns a single file with alts', async () => {
    const file = { id: 'f1', folderId: null, filename: 'a.jpg', url: '/a.jpg', mimeType: 'image/jpeg', size: 100, width: 800, height: 600, createdAt: new Date() };
    const alts = [{ locale: 'fr', alt: 'Alt', title: 'Title' }];

    mockDb.select
      .mockReturnValueOnce(selectChain([file]))
      .mockReturnValueOnce(selectChain(alts));

    const result = await getMediaFile('f1');
    expect(result).not.toBeNull();
    expect(result!.alts).toHaveLength(1);
  });

  it('returns null for missing file', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    const result = await getMediaFile('nope');
    expect(result).toBeNull();
  });
});

// ─── getMediaFileCountsByFolder ─────────────────────────────────────

describe('getMediaFileCountsByFolder', () => {
  it('returns counts per folder', async () => {
    const rows = [
      { folderId: 'f1', count: 5 },
      { folderId: null, count: 3 },
    ];
    mockDb.select.mockReturnValueOnce(selectChain(rows));

    const result = await getMediaFileCountsByFolder();
    expect(result.get('f1')).toBe(5);
    expect(result.get(null)).toBe(3);
  });
});

// ─── getMediaStats ──────────────────────────────────────────────────

describe('getMediaStats', () => {
  it('returns aggregate stats', async () => {
    // fileStats query — returns array (destructured as [fileStats])
    const fileStatsChain = selectChain([{ totalFiles: 10, totalSize: 5000 }]);
    mockDb.select.mockReturnValueOnce(fileStatsChain);
    // folderStats query
    const folderStatsChain = selectChain([{ totalFolders: 3 }]);
    mockDb.select.mockReturnValueOnce(folderStatsChain);

    const result = await getMediaStats();
    expect(result.totalFiles).toBe(10);
    expect(result.totalSize).toBe(5000);
    expect(result.totalFolders).toBe(3);
  });
});
