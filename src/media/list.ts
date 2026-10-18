import { readdir, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import type { UploadType } from './types';
import { UPLOAD_DIRS } from './types';

export interface MediaFile {
  name: string;
  url: string;
  type: UploadType;
  size: number;
  ext: string;
  modifiedAt: string;
}

/**
 * List uploaded files for a given upload type (or all types).
 * Reads the filesystem under public/uploads/.
 */
export async function listUploads(type?: UploadType): Promise<MediaFile[]> {
  const uploadsRoot = resolve(process.cwd(), 'public', 'uploads');
  const types = type ? [type] : (Object.keys(UPLOAD_DIRS) as UploadType[]);
  const results: MediaFile[] = [];

  for (const t of types) {
    const subDir = UPLOAD_DIRS[t];
    const dirPath = join(uploadsRoot, subDir);

    let files: string[];
    try {
      files = await readdir(dirPath);
    } catch {
      continue; // directory doesn't exist yet
    }

    for (const file of files) {
      // Skip WebP variants (companion files)
      if (file.endsWith('.webp')) continue;

      const filePath = join(dirPath, file);
      try {
        const info = await stat(filePath);
        if (!info.isFile()) continue;
        results.push({
          name: file,
          url: `/uploads/${subDir}/${file}`,
          type: t,
          size: info.size,
          ext: extname(file).toLowerCase(),
          modifiedAt: info.mtime.toISOString(),
        });
      } catch {
        continue;
      }
    }
  }

  // Most recent first
  results.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return results;
}
