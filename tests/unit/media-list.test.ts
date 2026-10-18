import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listUploads } from '@/media/list';

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
}));

import { readdir, stat } from 'node:fs/promises';

const mockReaddir = vi.mocked(readdir);
const mockStat = vi.mocked(stat);

describe('listUploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when directories do not exist', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'));
    const result = await listUploads();
    expect(result).toEqual([]);
  });

  it('lists files from a specific upload type', async () => {
    mockReaddir.mockResolvedValue(['abc.jpg', 'abc.webp', 'def.png'] as any);
    mockStat.mockResolvedValue({
      isFile: () => true,
      size: 1024,
      mtime: new Date('2026-03-20T12:00:00Z'),
    } as any);

    const result = await listUploads('avatar');

    // Should skip .webp companion
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('abc.jpg');
    expect(result[0].url).toBe('/uploads/images/avatars/abc.jpg');
    expect(result[0].type).toBe('avatar');
    expect(result[0].ext).toBe('.jpg');
    expect(result[0].size).toBe(1024);
  });

  it('lists files from all types when no type specified', async () => {
    // Each type directory call (avatar, logo, site, media)
    mockReaddir
      .mockResolvedValueOnce(['avatar1.jpg'] as any) // avatars
      .mockResolvedValueOnce(['logo1.png'] as any)    // logos
      .mockResolvedValueOnce(['site1.svg'] as any)    // site
      .mockResolvedValueOnce(['media1.jpg'] as any);  // media

    mockStat.mockResolvedValue({
      isFile: () => true,
      size: 2048,
      mtime: new Date('2026-03-20T12:00:00Z'),
    } as any);

    const result = await listUploads();
    expect(result).toHaveLength(4);
    expect(result.map((f) => f.type)).toEqual(
      expect.arrayContaining(['avatar', 'logo', 'site', 'media']),
    );
  });

  it('sorts results by modifiedAt descending', async () => {
    mockReaddir.mockResolvedValue(['old.jpg', 'new.jpg'] as any);
    mockStat
      .mockResolvedValueOnce({
        isFile: () => true,
        size: 100,
        mtime: new Date('2026-01-01T00:00:00Z'),
      } as any)
      .mockResolvedValueOnce({
        isFile: () => true,
        size: 200,
        mtime: new Date('2026-03-20T00:00:00Z'),
      } as any);

    const result = await listUploads('avatar');
    expect(result[0].name).toBe('new.jpg');
    expect(result[1].name).toBe('old.jpg');
  });
});
