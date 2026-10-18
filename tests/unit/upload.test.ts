import { describe, it, expect, afterAll } from 'vitest';
import sharp from 'sharp';
import { processUpload, UploadError } from '@/media/upload';
import { deleteUpload } from '@/media/delete';
import { ALLOWED_MIME_TYPES, DEFAULT_MAX_SIZE, UPLOAD_DIRS } from '@/media/types';
import { unlink, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Magic byte headers for valid image files */
const IMAGE_HEADERS: Record<string, Uint8Array> = {
  'image/jpeg': new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]),
  'image/png': new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  'image/webp': new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x00, 0x00, 0x00, 0x00, // file size placeholder
    0x57, 0x45, 0x42, 0x50, // WEBP
  ]),
  'image/avif': new Uint8Array([
    0x00, 0x00, 0x00, 0x1C, // box size
    0x66, 0x74, 0x79, 0x70, // ftyp
  ]),
};

/**
 * Encode une VRAIE image du type demandé (résultat mis en cache).
 *
 * Ces tests utilisaient des magic bytes + du texte : la validation de type
 * passait, mais le fichier n'était pas décodable. Le traitement d'image
 * (variantes WebP responsive) ne pouvait donc jamais être exercé pour de bon —
 * il ne faisait qu'échouer bruyamment sur un buffer corrompu.
 */
const REAL_IMAGE_CACHE = new Map<string, Promise<Buffer>>();

function realImageBytes(type: string): Promise<Buffer> {
  const cached = REAL_IMAGE_CACHE.get(type);
  if (cached) return cached;

  const base = sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 180, g: 120, b: 60 } },
  });
  const promise =
    type === 'image/jpeg'
      ? base.jpeg().toBuffer()
      : type === 'image/webp'
        ? base.webp().toBuffer()
        : base.png().toBuffer();
  REAL_IMAGE_CACHE.set(type, promise);
  return promise;
}

/** File backed by a genuinely decodable image. */
async function createRealFile(name: string, type: string): Promise<File> {
  // `new Uint8Array(buffer)` : la copie est nécessaire car `Buffer` est un
  // `ArrayBufferLike`, que le type `BlobPart` refuse (il exige `ArrayBuffer`).
  const bytes = new Uint8Array(await realImageBytes(type));
  return new File([bytes], name, { type });
}

/** Create a mock File object with valid magic bytes */
function createMockFile(
  name: string,
  content: string,
  type: string,
): File {
  const header = IMAGE_HEADERS[type];
  if (header) {
    const textBytes = new TextEncoder().encode(content);
    const combined = new Uint8Array(header.length + textBytes.length);
    combined.set(header);
    combined.set(textBytes, header.length);
    return new File([combined], name, { type });
  }
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

// ─── processUpload ──────────────────────────────────────────────────

describe('processUpload', () => {
  const createdFiles: string[] = [];

  // Cleanup uploaded files after tests
  afterAll(async () => {
    for (const path of createdFiles) {
      await unlink(path).catch(() => {});
    }
  });

  it('accepts a valid image upload', async () => {
    const file = await createRealFile('photo.jpg', 'image/jpeg');
    const result = await processUpload(file, { subDir: 'images/test' });

    expect(result.filename).toMatch(/^[0-9a-f-]+\.jpg$/);
    expect(result.url).toMatch(/^\/uploads\/images\/test\/[0-9a-f-]+\.jpg$/);
    expect(result.path).toContain('public');
    createdFiles.push(result.path);
  });

  it('rejects invalid MIME type', async () => {
    const file = createMockFile('malware.exe', 'MZ...', 'application/x-msdownload');

    await expect(processUpload(file, { subDir: 'images/test' }))
      .rejects.toThrow(UploadError);

    try {
      await processUpload(file, { subDir: 'images/test' });
    } catch (err) {
      expect(err).toBeInstanceOf(UploadError);
      expect((err as UploadError).code).toBe('INVALID_TYPE');
    }
  });

  it('rejects a truncated image: magic bytes valid, pixels unreadable', async () => {
    // Le cas que la validation par magic bytes laissait passer : l'en-tête JPEG
    // est bon (FF D8 FF) mais le corps est coupé. Stocké tel quel, l'image
    // s'afficherait cassée et aucune variante ne pourrait être générée.
    const full = new Uint8Array(await realImageBytes('image/jpeg'));
    const truncated = full.slice(0, Math.floor(full.length / 3));
    const file = new File([truncated], 'tronquee.jpg', { type: 'image/jpeg' });

    await expect(processUpload(file, { subDir: 'images/test' })).rejects.toThrow(UploadError);
    await expect(processUpload(file, { subDir: 'images/test' })).rejects.toMatchObject({
      code: 'UNDECODABLE_IMAGE',
    });
  });

  it('rejects magic bytes with no image payload at all', async () => {
    // 4 octets de signature JPEG + texte : c'est ce que les anciens tests
    // uploadaient, et ce que la seule vérification de type acceptait.
    const file = createMockFile('fake.jpg', 'ceci nest pas une image', 'image/jpeg');
    await expect(processUpload(file, { subDir: 'images/test' })).rejects.toMatchObject({
      code: 'UNDECODABLE_IMAGE',
    });
  });

  it('never writes an undecodable file to disk', async () => {
    const full = new Uint8Array(await realImageBytes('image/jpeg'));
    const truncated = full.slice(0, Math.floor(full.length / 4));
    const file = new File([truncated], 'jamais-ecrit.jpg', { type: 'image/jpeg' });

    const before = await readdir(join(process.cwd(), 'public', 'uploads', 'images', 'test')).catch(
      () => [] as string[],
    );
    await expect(processUpload(file, { subDir: 'images/test' })).rejects.toThrow();
    const after = await readdir(join(process.cwd(), 'public', 'uploads', 'images', 'test')).catch(
      () => [] as string[],
    );
    expect(after.length).toBe(before.length);
  });

  it('returns the decoded dimensions so callers do not re-decode', async () => {
    const file = await createRealFile('mesure.jpg', 'image/jpeg');
    const result = await processUpload(file, { subDir: 'images/test' });
    expect(result.dimensions).toEqual({ width: 800, height: 600 });
    createdFiles.push(result.path);
  });

  it('reports no dimensions for a vector upload (SVG)', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
    const file = new File([svg], 'logo.svg', { type: 'image/svg+xml' });
    const result = await processUpload(file, { subDir: 'images/test' });
    expect(result.dimensions).toBeNull();
    expect(result.variants).toEqual([]);
    createdFiles.push(result.path);
  });

  it('rejects file exceeding max size', async () => {
    // Create a file that claims to be > 2MB via size override
    const big = new File([new Uint8Array(DEFAULT_MAX_SIZE + 1)], 'huge.png', {
      type: 'image/png',
    });

    await expect(processUpload(big, { subDir: 'images/test' }))
      .rejects.toThrow(UploadError);

    try {
      await processUpload(big, { subDir: 'images/test' });
    } catch (err) {
      expect((err as UploadError).code).toBe('FILE_TOO_LARGE');
    }
  });

  it('respects custom maxSize option', async () => {
    const file = createMockFile('small.webp', 'x'.repeat(100), 'image/webp');
    // Set maxSize to 50 bytes — file is 100 bytes
    await expect(processUpload(file, { subDir: 'images/test', maxSize: 50 }))
      .rejects.toThrow(UploadError);
  });

  it('rejects empty file (size === 0)', async () => {
    const file = new File([], 'empty.png', { type: 'image/png' });
    await expect(processUpload(file, { subDir: 'images/test' }))
      .rejects.toThrow(UploadError);

    try {
      await processUpload(file, { subDir: 'images/test' });
    } catch (err) {
      expect((err as UploadError).code).toBe('EMPTY_FILE');
    }
  });

  it('sanitizes SVG with embedded <script> tag (saves cleaned version)', async () => {
    const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>';
    const file = new File([maliciousSvg], 'evil.svg', { type: 'image/svg+xml' });
    const result = await processUpload(file, { subDir: 'images/test', allowedTypes: ['image/svg+xml'] as any });
    createdFiles.push(result.path);

    const saved = await readFile(result.path, 'utf-8');
    expect(saved).not.toContain('<script');
    expect(saved).not.toContain('alert');
    expect(saved).toContain('<svg');
  });

  it('sanitizes SVG with onload event handler (saves cleaned version)', async () => {
    const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>';
    const file = new File([maliciousSvg], 'evil.svg', { type: 'image/svg+xml' });
    const result = await processUpload(file, { subDir: 'images/test', allowedTypes: ['image/svg+xml'] as any });
    createdFiles.push(result.path);

    const saved = await readFile(result.path, 'utf-8');
    expect(saved).not.toContain('onload');
    expect(saved).not.toContain('alert');
    expect(saved).toContain('<svg');
  });

  it('sanitizes SVG with foreignObject (saves cleaned version)', async () => {
    const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>';
    const file = new File([maliciousSvg], 'evil.svg', { type: 'image/svg+xml' });
    const result = await processUpload(file, { subDir: 'images/test', allowedTypes: ['image/svg+xml'] as any });
    createdFiles.push(result.path);

    const saved = await readFile(result.path, 'utf-8');
    expect(saved).not.toContain('<script');
    expect(saved).not.toContain('foreignObject');
    expect(saved).toContain('<svg');
  });

  it('rejects subDir with path traversal', async () => {
    const file = await createRealFile('photo.jpg', 'image/jpeg');
    await expect(processUpload(file, { subDir: '../../../etc' }))
      .rejects.toThrow(UploadError);

    try {
      await processUpload(file, { subDir: '../../../etc' });
    } catch (err) {
      expect((err as UploadError).code).toBe('INVALID_SUBDIR');
    }
  });

  it('generates UUID filename (not original name)', async () => {
    const file = await createRealFile('../../etc/passwd.png', 'image/png');
    const result = await processUpload(file, { subDir: 'images/test' });

    // Filename should be a UUID, not the original name
    expect(result.filename).not.toContain('passwd');
    expect(result.filename).not.toContain('..');
    expect(result.filename).toMatch(/^[0-9a-f-]+\.png$/);
    createdFiles.push(result.path);
  });
});

// ─── UPLOAD_DIRS & constants ────────────────────────────────────────

describe('Media constants', () => {
  it('ALLOWED_MIME_TYPES contains only image types', () => {
    for (const mime of ALLOWED_MIME_TYPES) {
      expect(mime).toMatch(/^image\//);
    }
  });

  it('DEFAULT_MAX_SIZE is 2MB', () => {
    expect(DEFAULT_MAX_SIZE).toBe(2 * 1024 * 1024);
  });

  it('UPLOAD_DIRS maps avatar and logo', () => {
    expect(UPLOAD_DIRS.avatar).toBe('images/avatars');
    expect(UPLOAD_DIRS.logo).toBe('images/logos');
  });
});

// ─── deleteUpload ───────────────────────────────────────────────────

describe('deleteUpload', () => {
  it('rejects URLs not starting with /uploads/', async () => {
    await expect(deleteUpload('/etc/passwd'))
      .rejects.toThrow('URL invalide');
    await expect(deleteUpload('../../../etc/passwd'))
      .rejects.toThrow('URL invalide');
    await expect(deleteUpload(''))
      .rejects.toThrow('URL invalide');
  });

  it('rejects path traversal attempts', async () => {
    await expect(deleteUpload('/uploads/../../etc/passwd'))
      .rejects.toThrow('path traversal');
  });

  it('rejects URL-encoded path traversal (..%2f)', async () => {
    // The url is /uploads/..%2f..%2fetc/passwd — after decoding by join/resolve this escapes
    await expect(deleteUpload('/uploads/..%2f..%2fetc/passwd'))
      .rejects.toThrow(); // Either 'path traversal' or ENOENT — must not silently succeed
  });

  it('rejects double-encoded path traversal (..%252f)', async () => {
    await expect(deleteUpload('/uploads/..%252f..%252fetc/passwd'))
      .rejects.toThrow();
  });

  it('rejects backslash traversal on Windows-style paths', async () => {
    await expect(deleteUpload('/uploads/..\\..\\etc\\passwd'))
      .rejects.toThrow('path traversal');
  });

  it('deletes companion WebP variant when deleting an image', async () => {
    // Upload a JPEG (which generates a WebP variant)
    const file = await createRealFile('photo.jpg', 'image/jpeg');
    const result = await processUpload(file, { subDir: 'images/test' });

    const webpPath = result.path.replace(/\.[^.]+$/, '.webp');
    const { existsSync } = await import('node:fs');

    // WebP may or may not have been generated (sharp may not be available in test)
    // If it exists, ensure it's cleaned up
    const webpExisted = existsSync(webpPath);

    await deleteUpload(result.url);

    // Main file should be gone
    expect(existsSync(result.path)).toBe(false);
    // If WebP existed, it should also be gone
    if (webpExisted) {
      expect(existsSync(webpPath)).toBe(false);
    }
  });
});
