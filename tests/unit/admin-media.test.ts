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
  getDrizzle: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    transaction: mockTransaction,
  })),
}));

vi.mock('@database/schemas', () => ({
  mediaFolders: { id: 'id', parentId: 'parentId', name: 'name' },
  mediaFiles: { id: 'id', folderId: 'folderId', url: 'url' },
  mediaFileAlts: { id: 'id', fileId: 'fileId', locale: 'locale' },
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
vi.mock('@/media/upload', () => ({
  processUpload: vi.fn(() => Promise.resolve({ url: '/uploads/media/test.jpg', path: '/tmp/test.jpg' })),
}));
vi.mock('@/media/delete', () => ({
  deleteUpload: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/media/types', () => ({ UPLOAD_DIRS: { media: 'media' } }));
vi.mock('node:fs/promises', () => ({
  rename: vi.fn(() => Promise.resolve()),
}));
const mockUserHasPermission = vi.fn(() => Promise.resolve({ success: true }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { userHasPermission: mockUserHasPermission } },
}));

// ── Imports ─────────────────────────────────────────────────────────
import {
  createMediaFolder as _createFolder,
  updateMediaFolder as _updateFolder,
  deleteMediaFolder as _deleteFolder,
  uploadMediaFile as _upload,
  renameMediaFile as _rename,
  moveMediaFile as _move,
  deleteMediaFile as _deleteFile,
  upsertMediaFileAlt as _upsertAlt,
  deleteMediaFileAlt as _deleteAlt,
} from '@/actions/admin/media';

const createMediaFolder = _createFolder as unknown as { handler: (...a: any[]) => Promise<any> };
const updateMediaFolder = _updateFolder as unknown as { handler: (...a: any[]) => Promise<any> };
const deleteMediaFolder = _deleteFolder as unknown as { handler: (...a: any[]) => Promise<any> };
const uploadMediaFile = _upload as unknown as { accept: string; handler: (...a: any[]) => Promise<any> };
const renameMediaFile = _rename as unknown as { handler: (...a: any[]) => Promise<any> };
const moveMediaFile = _move as unknown as { handler: (...a: any[]) => Promise<any> };
const deleteMediaFile = _deleteFile as unknown as { handler: (...a: any[]) => Promise<any> };
const upsertMediaFileAlt = _upsertAlt as unknown as { handler: (...a: any[]) => Promise<any> };
const deleteMediaFileAlt = _deleteAlt as unknown as { handler: (...a: any[]) => Promise<any> };

function adminCtx() {
  return {
    locals: { user: { id: 'admin-1', role: 'admin', email: 'a@test.com' } },
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

function insertChain(rows: any[]) {
  return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) };
}
function updateChain(rows: any[]) {
  const terminal: any = Object.assign(Promise.resolve(rows), {
    returning: vi.fn().mockResolvedValue(rows),
  });
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(terminal),
    }),
  };
}
function deleteChain(rows: any[]) {
  const terminal: any = Object.assign(Promise.resolve(rows), {
    returning: vi.fn().mockResolvedValue(rows),
  });
  return { where: vi.fn().mockReturnValue(terminal) };
}

beforeEach(() => {
  mockSelect.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockTransaction.mockReset();
});

// ─── createMediaFolder ──────────────────────────────────────────────

describe('createMediaFolder', () => {
  it('creates a folder', async () => {
    const created = { id: 'f1', name: 'Photos' };
    mockInsert.mockReturnValue(insertChain([created]));

    const result = await createMediaFolder.handler({ name: 'Photos' }, adminCtx());
    expect(result).toEqual(created);
  });

  it('throws CONFLICT on duplicate name', async () => {
    const dbError = new Error('dup') as any;
    dbError.code = '23505';
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockRejectedValue(dbError) }),
    });

    await expect(
      createMediaFolder.handler({ name: 'Photos' }, adminCtx()),
    ).rejects.toThrow('existe déjà');
  });

  it('rejects non-admin', async () => {
    mockUserHasPermission.mockResolvedValueOnce({ success: false });
    const ctx = { locals: { user: { id: 'u1', role: 'user' } }, request: { headers: new Headers() } } as any;
    await expect(
      createMediaFolder.handler({ name: 'X' }, ctx),
    ).rejects.toThrow('Permissions insuffisantes');
  });
});

// ─── updateMediaFolder ──────────────────────────────────────────────

describe('updateMediaFolder', () => {
  it('updates a folder via transaction', async () => {
    const updated = { id: 'f1', name: 'Renamed' };
    // assertFolderInTenant(id) — folder exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'f1', organizationId: null, parentId: null }]));
    mockTransaction.mockImplementation(async (cb: any) => {
      const tx = {
        select: vi.fn().mockReturnValue(selectChain([])),
        update: vi.fn().mockReturnValue(updateChain([updated])),
      };
      return cb(tx);
    });

    const result = await updateMediaFolder.handler({ id: 'f1', name: 'Renamed' }, adminCtx());
    expect(result).toEqual(updated);
  });

  it('throws on self-referencing parentId', async () => {
    // assertFolderInTenant(id) → folder exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'f1', organizationId: null, parentId: null }]));
    // assertFolderInTenant(parentId) → folder exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'f2', organizationId: null, parentId: null }]));
    mockTransaction.mockImplementation(async (cb: any) => {
      // Walk: f2 → parent f1 → parent f1 (cycle back to f1, already visited)
      const tx = {
        select: vi.fn().mockImplementation((_cols: any) => {
          const terminal: any = Object.assign(Promise.resolve([{ parentId: 'f1' }]), {
            limit: vi.fn().mockResolvedValue([{ parentId: 'f1' }]),
          });
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue(terminal),
            }),
          };
        }),
        update: vi.fn().mockReturnValue(updateChain([])),
      };
      return cb(tx);
    });

    await expect(
      updateMediaFolder.handler({ id: 'f1', parentId: 'f2' }, adminCtx()),
    ).rejects.toThrow('référence circulaire');
  });
});

// ─── deleteMediaFolder ──────────────────────────────────────────────

describe('deleteMediaFolder', () => {
  it('deletes an empty folder', async () => {
    // assertFolderInTenant → folder exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'f1', organizationId: null, parentId: null }]));
    // Check children → empty
    mockSelect.mockReturnValueOnce(selectChain([]));
    // Check files → empty
    mockSelect.mockReturnValueOnce(selectChain([]));
    // Delete
    mockDelete.mockReturnValue(deleteChain([{ id: 'f1', name: 'Photos' }]));

    const result = await deleteMediaFolder.handler({ id: 'f1' }, adminCtx());
    expect(result).toEqual({ success: true });
  });

  it('rejects deleting folder with children', async () => {
    // assertFolderInTenant → folder exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'f1', organizationId: null, parentId: null }]));
    // Check children → has one
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'child1' }]));

    await expect(
      deleteMediaFolder.handler({ id: 'f1' }, adminCtx()),
    ).rejects.toThrow('sous-dossiers');
  });

  it('rejects deleting folder with files', async () => {
    // assertFolderInTenant → folder exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'f1', organizationId: null, parentId: null }]));
    // Check children → empty
    mockSelect.mockReturnValueOnce(selectChain([]));
    // Check files → has one
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'file1' }]));

    await expect(
      deleteMediaFolder.handler({ id: 'f1' }, adminCtx()),
    ).rejects.toThrow('fichiers');
  });

  it('throws NOT_FOUND for missing folder', async () => {
    // assertFolderInTenant → not found
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      deleteMediaFolder.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── moveMediaFile ──────────────────────────────────────────────────

// ─── uploadMediaFile ────────────────────────────────────────────────

describe('uploadMediaFile', () => {
  it('uploads a file to root folder', async () => {
    const created = { id: 'file1', filename: 'test.jpg', url: '/uploads/media/test.jpg', folderId: null };
    mockInsert.mockReturnValue(insertChain([created]));

    const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
    const result = await uploadMediaFile.handler({ file, folderId: null }, adminCtx());
    expect(result).toEqual(created);
  });

  it('uploads a file into a specific folder', async () => {
    const created = { id: 'file1', filename: 'test.jpg', url: '/uploads/media/test.jpg', folderId: 'f1' };
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'f1' }])); // folder exists
    mockInsert.mockReturnValue(insertChain([created]));

    const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
    const result = await uploadMediaFile.handler({ file, folderId: 'f1' }, adminCtx());
    expect(result.folderId).toBe('f1');
  });

  it('throws NOT_FOUND when target folder does not exist', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
    await expect(
      uploadMediaFile.handler({ file, folderId: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── renameMediaFile ────────────────────────────────────────────────

describe('renameMediaFile', () => {
  it('renames a file on disk and in DB', async () => {
    const file = { id: 'file1', filename: 'old.jpg', url: '/uploads/media/old.jpg' };
    const updated = { id: 'file1', filename: 'new.jpg', url: '/uploads/media/new.jpg' };
    mockSelect.mockReturnValueOnce(selectChain([file]));
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await renameMediaFile.handler({ id: 'file1', filename: 'new.jpg' }, adminCtx());
    expect(result.filename).toBe('new.jpg');
  });

  it('preserves extension when not provided', async () => {
    const file = { id: 'file1', filename: 'old.jpg', url: '/uploads/media/old.jpg' };
    const updated = { id: 'file1', filename: 'newname.jpg', url: '/uploads/media/newname.jpg' };
    mockSelect.mockReturnValueOnce(selectChain([file]));
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await renameMediaFile.handler({ id: 'file1', filename: 'newname' }, adminCtx());
    expect(result.filename).toBe('newname.jpg');
  });

  it('throws NOT_FOUND for missing file', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      renameMediaFile.handler({ id: 'nope', filename: 'x' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── moveMediaFile ──────────────────────────────────────────────────

describe('moveMediaFile', () => {
  it('moves a file to a folder', async () => {
    const updated = { id: 'file1', folderId: 'f2' };
    // assertFileInTenant → file exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'file1', organizationId: null }]));
    // assertFolderInTenant → folder exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'f2', organizationId: null, parentId: null }]));
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await moveMediaFile.handler({ id: 'file1', folderId: 'f2' }, adminCtx());
    expect(result).toEqual(updated);
  });

  it('moves a file to root (null)', async () => {
    const updated = { id: 'file1', folderId: null };
    // assertFileInTenant → file exists (no folder check since folderId is null)
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'file1', organizationId: null }]));
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await moveMediaFile.handler({ id: 'file1', folderId: null }, adminCtx());
    expect(result).toEqual(updated);
  });

  it('throws NOT_FOUND for missing target folder', async () => {
    // assertFileInTenant → file exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'file1', organizationId: null }]));
    // assertFolderInTenant → folder not found
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      moveMediaFile.handler({ id: 'file1', folderId: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });

  it('throws NOT_FOUND for missing file', async () => {
    // assertFileInTenant → file not found
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      moveMediaFile.handler({ id: 'nope', folderId: null }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── deleteMediaFile ────────────────────────────────────────────────

describe('deleteMediaFile', () => {
  it('deletes a file (disk + DB)', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{
      id: 'file1', filename: 'test.jpg', url: '/uploads/media/test.jpg',
    }]));
    mockDelete.mockReturnValue(deleteChain([]));

    const result = await deleteMediaFile.handler({ id: 'file1' }, adminCtx());
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND for missing file', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      deleteMediaFile.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── upsertMediaFileAlt ─────────────────────────────────────────────

describe('upsertMediaFileAlt', () => {
  it('inserts a new alt text', async () => {
    // File exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'file1' }]));
    // Existing alt → none
    mockSelect.mockReturnValueOnce(selectChain([]));
    // Insert
    const created = { id: 'alt1', fileId: 'file1', locale: 'fr', alt: 'Photo', title: null };
    mockInsert.mockReturnValue(insertChain([created]));

    const result = await upsertMediaFileAlt.handler(
      { fileId: 'file1', locale: 'fr', alt: 'Photo' },
      adminCtx(),
    );
    expect(result).toEqual(created);
  });

  it('updates an existing alt text', async () => {
    // File exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'file1' }]));
    // Existing alt → found
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'alt1' }]));
    // Update
    const updated = { id: 'alt1', fileId: 'file1', locale: 'fr', alt: 'Updated', title: null };
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await upsertMediaFileAlt.handler(
      { fileId: 'file1', locale: 'fr', alt: 'Updated' },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });

  it('throws NOT_FOUND for missing file', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      upsertMediaFileAlt.handler({ fileId: 'nope', locale: 'fr', alt: 'x' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── deleteMediaFileAlt ─────────────────────────────────────────────

describe('deleteMediaFileAlt', () => {
  it('deletes an alt text', async () => {
    // assertFileInTenant → file exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'file1', organizationId: null }]));
    mockDelete.mockReturnValue(deleteChain([{ id: 'alt1' }]));

    const result = await deleteMediaFileAlt.handler(
      { fileId: 'file1', locale: 'fr' },
      adminCtx(),
    );
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND for missing alt', async () => {
    // assertFileInTenant → file exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'file1', organizationId: null }]));
    // delete returns nothing → NOT_FOUND
    mockDelete.mockReturnValue(deleteChain([]));

    await expect(
      deleteMediaFileAlt.handler({ fileId: 'file1', locale: 'fr' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});
