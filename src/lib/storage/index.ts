/**
 * Sélection du driver de stockage depuis l'environnement (brique e).
 *
 *   STORAGE_DRIVER=local (défaut) | s3 | r2
 *   S3_BUCKET, S3_REGION (auto pour R2), S3_ENDPOINT, S3_ACCESS_KEY_ID,
 *   S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL, S3_FORCE_PATH_STYLE, S3_PREFIX, S3_TIMEOUT_MS
 */
import { Effect, Layer } from 'effect';
import { AppConfig } from '@/lib/effect/config';
import { ConfigError } from '@/lib/effect/errors';
import { makeLocalStorage } from './local';
import { makeS3Storage, type S3Settings } from './s3';
import { Storage, type StorageShape } from './storage';

export * from './storage';

export function s3SettingsFromEnv(env: Readonly<Record<string, string | undefined>>): S3Settings | ConfigError {
  const bucket = env.S3_BUCKET?.trim();
  if (!bucket) return new ConfigError({ key: 'S3_BUCKET', reason: 'required when STORAGE_DRIVER=s3|r2' });
  const isR2 = env.STORAGE_DRIVER === 'r2';
  const endpoint = env.S3_ENDPOINT?.trim() || undefined;
  if (isR2 && !endpoint) return new ConfigError({ key: 'S3_ENDPOINT', reason: 'required for R2 (https://<account>.r2.cloudflarestorage.com)' });
  const region = env.S3_REGION?.trim() || (isR2 ? 'auto' : 'us-east-1');
  const publicUrl =
    env.S3_PUBLIC_URL?.trim().replace(/\/$/, '') ||
    (endpoint ? `${endpoint.replace(/\/$/, '')}/${bucket}` : `https://${bucket}.s3.${region}.amazonaws.com`);
  const prefix = (env.S3_PREFIX?.trim() ?? '').replace(/^\/+/, '');
  return {
    bucket,
    region,
    endpoint,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true' || (!!endpoint && !isR2 && env.S3_FORCE_PATH_STYLE !== 'false'),
    publicUrl,
    prefix: prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix,
    timeoutMs: Number(env.S3_TIMEOUT_MS) > 0 ? Number(env.S3_TIMEOUT_MS) : 30_000,
  };
}

export function storageFromEnv(env: Readonly<Record<string, string | undefined>>): StorageShape {
  const driver = (env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (driver === 'local') return makeLocalStorage();
  if (driver === 's3' || driver === 'r2') {
    const settings = s3SettingsFromEnv({ ...env, STORAGE_DRIVER: driver });
    if (settings instanceof ConfigError) throw settings;
    return makeS3Storage(settings);
  }
  throw new ConfigError({ key: 'STORAGE_DRIVER', reason: `unknown driver "${driver}" (local | s3 | r2)` });
}

/** Une configuration de stockage invalide est fatale au démarrage (defect). */
export const StorageLive = Layer.effect(
  Storage,
  AppConfig.use((config) => Effect.sync(() => storageFromEnv(config.env))),
);

/** Origine publique des médias distants (pour la CSP img-src), ou null en local. */
export function storagePublicOrigin(env: Readonly<Record<string, string | undefined>>): string | null {
  const driver = (env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (driver === 'local') return null;
  const s = s3SettingsFromEnv({ ...env, STORAGE_DRIVER: driver });
  if (s instanceof ConfigError) return null;
  try {
    return new URL(s.publicUrl).origin;
  } catch {
    return null;
  }
}
