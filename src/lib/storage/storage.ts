/**
 * Service `Storage` (brique e) : stockage objet des médias.
 *
 * Drivers : `local` (public/uploads, servi par Astro/Caddy) et `s3`
 * (AWS S3, Cloudflare R2, Scaleway, Backblaze, MinIO… via endpoint).
 * Les clés sont relatives (`media/2026/abc.jpg`) ; `publicUrl(key)` donne
 * l'URL publique selon le driver.
 */
import { Context, Data, Effect } from 'effect';

export class StorageError extends Data.TaggedError('StorageError')<{
  readonly operation: string;
  readonly key?: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `Storage ${this.operation} failed${this.key ? ` for ${this.key}` : ''}`;
  }
}

export class InvalidStorageKeyError extends Data.TaggedError('InvalidStorageKeyError')<{ readonly key: string }> {
  override get message() {
    return `Invalid storage key: ${this.key}`;
  }
}

export interface StoredObject {
  readonly key: string;
  readonly size: number;
  readonly lastModified: Date;
}

export interface PutOptions {
  readonly contentType: string;
  readonly cacheControl?: string;
}

export interface StorageShape {
  readonly driver: 'local' | 's3';
  readonly put: (key: string, body: Uint8Array, options: PutOptions) => Effect.Effect<{ key: string; url: string }, StorageError | InvalidStorageKeyError>;
  readonly get: (key: string) => Effect.Effect<Uint8Array, StorageError | InvalidStorageKeyError>;
  readonly remove: (key: string) => Effect.Effect<void, StorageError | InvalidStorageKeyError>;
  readonly list: (prefix: string) => Effect.Effect<StoredObject[], StorageError | InvalidStorageKeyError>;
  readonly publicUrl: (key: string) => string;
  /** Inverse de `publicUrl` : clé d'une URL servie par ce driver, sinon null. */
  readonly keyFromUrl: (url: string) => string | null;
}

export class Storage extends Context.Service<Storage, StorageShape>()('polyweb/Storage') {}

const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/;

/** Clé sûre : segments alphanumériques, pas de `..`, pas de `/` initial, ≤ 512. */
export const validateKey = (key: string, opts: { allowEmpty?: boolean; allowTrailingSlash?: boolean } = {}) => {
  const k = opts.allowTrailingSlash ? key.replace(/\/$/, '') : key;
  if (opts.allowEmpty && k === '') return Effect.succeed(key);
  return k.length <= 512 && KEY_RE.test(k) && !k.split('/').some((s) => s === '..' || s === '.')
    ? Effect.succeed(key)
    : Effect.fail(new InvalidStorageKeyError({ key }));
};

export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
