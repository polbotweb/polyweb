import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import DOMPurify from 'isomorphic-dompurify';
import sharp from 'sharp';
import type { UploadOptions, UploadResult, AllowedMimeType } from './types';
import { ALLOWED_MIME_TYPES, DEFAULT_MAX_SIZE } from './types';

// ─── Magic bytes signatures for allowed image types ────────────────
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  'image/jpeg': [{ offset: 0, bytes: [0xFF, 0xD8, 0xFF] }],
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] }],
  'image/webp': [{ offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }],
  'image/avif': [
    { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // 'ftyp' box
    { offset: 8, bytes: [0x61, 0x76, 0x69, 0x66] }, // 'avif' brand (distinguishes from MP4/MOV)
  ],
  'image/x-icon': [{ offset: 0, bytes: [0x00, 0x00, 0x01, 0x00] }],
};

/** Text-based MIME types that cannot be validated by magic bytes */
const TEXT_BASED_TYPES = new Set(['image/svg+xml']);

function detectMimeFromBytes(buffer: Buffer): string | null {
  for (const [mime, signatures] of Object.entries(MAGIC_BYTES)) {
    const allMatch = signatures.every((sig) => {
      if (buffer.length < sig.offset + sig.bytes.length) return false;
      return sig.bytes.every((b, i) => buffer[sig.offset + i] === b);
    });
    if (allMatch) return mime;
  }
  return null;
}

/**
 * Traite un fichier uploadé : valide type/taille, génère un nom unique,
 * écrit sur le disque dans public/uploads/{subDir}/.
 */
export async function processUpload(
  file: File,
  options: UploadOptions,
): Promise<UploadResult> {
  const { subDir, maxSize = DEFAULT_MAX_SIZE, allowedTypes = ALLOWED_MIME_TYPES } = options;

  // ─── Validation MIME (déclarée par le client) ─────────────────────
  if (!allowedTypes.includes(file.type as AllowedMimeType)) {
    throw new UploadError(
      `Type "${file.type}" non autorisé. Types acceptés : ${allowedTypes.join(', ')}`,
      'INVALID_TYPE',
    );
  }

  // ─── Validation taille ───────────────────────────────────────────
  if (file.size === 0) {
    throw new UploadError('Le fichier est vide.', 'EMPTY_FILE');
  }
  if (file.size > maxSize) {
    const maxMB = (maxSize / (1024 * 1024)).toFixed(1);
    throw new UploadError(
      `Fichier trop volumineux. Maximum : ${maxMB} MB`,
      'FILE_TOO_LARGE',
    );
  }

  // ─── Génération nom unique ───────────────────────────────────────
  const ext = mimeToExt(file.type);
  const filename = `${randomUUID()}${ext}`;

  // ─── Validation sous-dossier ──────────────────────────────────────
  if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?$/.test(subDir)) {
    throw new UploadError('Sous-dossier invalide.', 'INVALID_SUBDIR');
  }

  // ─── Écriture sur disque ─────────────────────────────────────────
  const dir = join(process.cwd(), 'public', 'uploads', subDir);
  await mkdir(dir, { recursive: true, mode: 0o755 });

  const filePath = join(dir, filename);
  let buffer = Buffer.from(await file.arrayBuffer());

  // ─── Validation magic bytes (contenu réel du fichier) ────────────
  if (!TEXT_BASED_TYPES.has(file.type)) {
    const detectedMime = detectMimeFromBytes(buffer);
    if (!detectedMime || !allowedTypes.includes(detectedMime as AllowedMimeType)) {
      throw new UploadError(
        'Le contenu du fichier ne correspond pas à un type autorisé.',
        'INVALID_CONTENT',
      );
    }
  } else if (file.type === 'image/svg+xml') {
    // Enforce stricter limit for SVG — parsing/sanitizing large SVG is CPU-intensive
    const SVG_MAX_SIZE = 256 * 1024; // 256 KB
    if (file.size > SVG_MAX_SIZE) {
      throw new UploadError(
        `Fichier SVG trop volumineux. Maximum : ${(SVG_MAX_SIZE / 1024).toFixed(0)} KB`,
        'FILE_TOO_LARGE',
      );
    }
    // Sanitize SVG with DOMPurify — write the sanitized output to strip any dangerous content
    const svgContent = buffer.toString('utf-8');
    const sanitized = DOMPurify.sanitize(svgContent, {
      USE_PROFILES: { svg: true, svgFilters: true },
    });
    if (sanitized.length === 0) {
      throw new UploadError(
        'Le fichier SVG contient du contenu potentiellement dangereux (scripts, event handlers ou éléments interdits).',
        'INVALID_CONTENT',
      );
    }
    buffer = Buffer.from(sanitized, 'utf-8');
  }

  await writeFile(filePath, buffer, { mode: 0o644 });

  // Generate WebP variant for raster images (JPEG/PNG) for next-gen format serving
  const RASTER_TYPES = new Set(['image/jpeg', 'image/png']);
  if (RASTER_TYPES.has(file.type)) {
    const webpFilename = filename.replace(/\.[^.]+$/, '.webp');
    const webpPath = join(dir, webpFilename);
    try {
      await sharp(buffer).webp({ quality: 80 }).toFile(webpPath);
    } catch (err) {
      console.error(`[upload] WebP generation failed for ${filename}:`, err);
    }
  }

  return {
    filename,
    path: filePath,
    url: `/uploads/${subDir}/${filename}`,
  };
}

/** Déduit l'extension depuis le type MIME */
function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/x-icon': '.ico',
    'image/svg+xml': '.svg',
  };
  return map[mime] ?? '.bin';
}

/** Erreur d'upload typée */
export class UploadError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
  }
}
