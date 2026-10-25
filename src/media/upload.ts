import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Data, Effect } from 'effect';
import { Storage, IMMUTABLE_CACHE, type StorageShape } from '@/lib/storage';
import { runApp } from '@/lib/effect/http';
import DOMPurify from 'isomorphic-dompurify';
import type { UploadOptions, UploadResult, AllowedMimeType } from './types';
import { ALLOWED_MIME_TYPES, DEFAULT_MAX_SIZE } from './types';
import { renderResponsiveVariantsEffect, decodeAndValidate, UndecodableImageError, ImageTooLargeError, type ImageVariant } from './variants';

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
 * Traite un fichier uploadé : valide type/taille/contenu, génère un nom
 * unique, puis écrit l'original et ses variantes via le service `Storage`
 * (local `public/uploads/`, S3 ou R2 — brique e).
 */
export async function processUpload(
  file: File,
  options: UploadOptions,
): Promise<UploadResult> {
  const prepared = await prepareUpload(file, options);
  try {
    return await runApp(storeUpload(prepared));
  } catch (err) {
    console.error('[upload] storage failure:', err);
    throw new UploadError("Le fichier n'a pas pu être enregistré (stockage indisponible).", 'STORAGE_ERROR');
  }
}

/** Erreur typée de l'upload (validation ou stockage) — version Effect de `UploadError`. */
export class UploadRejected extends Data.TaggedError('UploadRejected')<{ readonly reason: string; readonly code: string }> {
  override get message() {
    return this.reason;
  }
}

/** Upload complet en Effect : validation puis stockage (original + variantes). */
export const uploadFile = (file: File, options: UploadOptions) =>
  Effect.gen(function* () {
    const prepared = yield* Effect.tryPromise({
      try: () => prepareUpload(file, options),
      catch: (e) => (e instanceof UploadError ? new UploadRejected({ reason: e.message, code: e.code }) : new UploadRejected({ reason: 'Fichier illisible', code: 'INVALID_FILE' })),
    });
    return yield* storeUpload(prepared).pipe(
      Effect.tapError((e) => Effect.logError('[upload] storage failure', e)),
      Effect.mapError(() => new UploadRejected({ reason: "Le fichier n'a pas pu être enregistré (stockage indisponible).", code: 'STORAGE_ERROR' })),
    );
  }).pipe(Effect.withSpan('media.upload'));

/** Fichier validé, prêt à être stocké. */
export interface PreparedUpload {
  key: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  dimensions: { width: number; height: number };
}

/** Écrit l'original + les variantes WebP via `Storage` (Effect). */
export const storeUpload = (p: PreparedUpload) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const stored = yield* storage.put(p.key, p.buffer, { contentType: p.mimeType, cacheControl: IMMUTABLE_CACHE });
    const rendered = yield* (
      renderResponsiveVariantsEffect({ buffer: p.buffer, mimeType: p.mimeType, url: stored.url, sourceWidth: p.dimensions.width, sourceHeight: p.dimensions.height })
    );
    const dirKey = p.key.slice(0, p.key.lastIndexOf('/') + 1);
    const variants: ImageVariant[] = yield* Effect.forEach(
      rendered,
      (v) => storage.put(`${dirKey}${v.filename}`, v.data, { contentType: 'image/webp', cacheControl: IMMUTABLE_CACHE }).pipe(Effect.as({ ...v.variant, url: storage.publicUrl(`${dirKey}${v.filename}`) })),
      { concurrency: 3 },
    ).pipe(
      // Une variante en échec ne fait jamais échouer l'upload : l'original reste servi.
      Effect.catchTag('StorageError', (e) => Effect.logWarning('variant upload failed', e).pipe(Effect.as([] as ImageVariant[]))),
    );
    return {
      filename: p.filename,
      key: p.key,
      path: diskPathOrKey(storage, p.key),
      url: stored.url,
      dimensions: p.dimensions.width > 0 ? p.dimensions : null,
      variants,
    } satisfies UploadResult;
  }).pipe(Effect.withSpan('media.storeUpload'));

function diskPathOrKey(storage: StorageShape, key: string): string {
  if (storage.driver !== 'local') return key;
  // Racine réelle du driver (et non `public/uploads` supposé) : un stockage local configuré ailleurs reste exact.
  return storage.localPath ? storage.localPath(key) : join(resolve(process.cwd(), 'public', 'uploads'), key);
}

/** Validation complète (type déclaré, taille, magic bytes, SVG assaini, décodage réel). */
export async function prepareUpload(file: File, options: UploadOptions): Promise<PreparedUpload> {
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

  // ─── Décodage réel (sécurité) ──────────────────────────────────────
  // La validation par magic bytes ne prouve QUE les 4 premiers octets. Un
  // JPEG tronqué, un PNG corrompu ou une « bombe de pixels » (2 Mo highly
  // compressés = 50 000×50 000) la passent sans problème — et se retrouve
  // ensuite stocké, illisible, ou capable d'épuiser la mémoire du serveur au
  // premier décodage.
  //
  // On force donc un décodage COMPLET avant d'écrire quoi que ce soit :
  // un fichier qu'on ne sait pas décoder n'est jamais écrit sur le disque.
  const dimensions = await decodeAndValidate(buffer, file.type).catch((err: unknown) => {
    if (err instanceof UndecodableImageError) {
      throw new UploadError(err.message, 'UNDECODABLE_IMAGE');
    }
    if (err instanceof ImageTooLargeError) {
      throw new UploadError(err.message, 'IMAGE_TOO_LARGE');
    }
    // sharp peut jeter une erreur brute (format non supporté, flux tronqué
    // détecté au décodage) : on ne veut jamais laisser fuiter le détail
    // technique de libvips au client.
    throw new UploadError(
      "L'image n'a pas pu être décodée. Le fichier est probablement corrompu ou d'un format non pris en charge.",
      'UNDECODABLE_IMAGE',
    );
  });

  return { key: `${subDir}/${filename}`, filename, mimeType: file.type, buffer, dimensions };
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
