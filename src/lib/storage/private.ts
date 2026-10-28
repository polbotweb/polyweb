/**
 * Stockage privé (documents comptables, exports) — distinct du stockage des médias, qui est public
 * (`public/uploads` servi tel quel, bucket média lisible). Aucune URL publique : lecture uniquement
 * via une route authentifiée qui relit l'objet (`get`).
 *
 *   STORAGE_DRIVER=local (défaut) → fichiers sous PRIVATE_STORAGE_DIR (défaut `storage/private`,
 *     hors de `public/`, ignoré par git) ; refusé s'il pointe sous `public/`.
 *   STORAGE_DRIVER=s3 | r2 → bucket S3_PRIVATE_BUCKET (obligatoire, non public), mêmes identifiants
 *     et endpoint que le stockage média ; préfixe S3_PRIVATE_PREFIX (facultatif).
 *
 * Configuration invalide : le service reste constructible (le démarrage n'en dépend pas) mais chaque
 * opération échoue en `StorageError` dont la cause est la `ConfigError` (l'export passe en échec,
 * motif lisible) — jamais de repli silencieux vers le stockage public.
 */
import { resolve, sep } from 'node:path';
import { Context, Effect, Layer } from 'effect';
import { AppConfig } from '@/lib/effect/config';
import { ConfigError } from '@/lib/effect/errors';
import { makeLocalStorage } from './local';
import { makeS3Storage } from './s3';
import { s3SettingsFromEnv } from './index';
import { StorageError, type StorageShape } from './storage';

export class PrivateStorage extends Context.Service<PrivateStorage, StorageShape>()('polyweb/PrivateStorage') {}

const PRIVATE_URL_BASE = 'private:';

const unavailable = (error: ConfigError, driver: StorageShape['driver']): StorageShape => {
  const fail = (operation: string, key?: string) => Effect.fail(new StorageError({ operation, key, cause: error }));
  return {
    driver,
    put: (key) => fail('put', key),
    get: (key) => fail('get', key),
    remove: (key) => fail('remove', key),
    list: (prefix) => fail('list', prefix),
    publicUrl: () => '',
    keyFromUrl: () => null,
  };
};

export function privateStorageFromEnv(env: Readonly<Record<string, string | undefined>>, cwd = process.cwd()): StorageShape | ConfigError {
  const driver = (env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (driver === 'local') {
    const root = resolve(cwd, env.PRIVATE_STORAGE_DIR?.trim() || 'storage/private');
    const publicRoot = resolve(cwd, 'public');
    if (root === publicRoot || root.startsWith(publicRoot + sep)) return new ConfigError({ key: 'PRIVATE_STORAGE_DIR', reason: 'must not be under public/' });
    return makeLocalStorage(root, PRIVATE_URL_BASE);
  }
  if (driver === 's3' || driver === 'r2') {
    const bucket = env.S3_PRIVATE_BUCKET?.trim();
    if (!bucket) return new ConfigError({ key: 'S3_PRIVATE_BUCKET', reason: 'required when STORAGE_DRIVER=s3|r2 (private documents)' });
    if (bucket === env.S3_BUCKET?.trim()) return new ConfigError({ key: 'S3_PRIVATE_BUCKET', reason: 'must differ from the public media bucket S3_BUCKET' });
    const settings = s3SettingsFromEnv({ ...env, STORAGE_DRIVER: driver, S3_BUCKET: bucket, S3_PREFIX: env.S3_PRIVATE_PREFIX, S3_PUBLIC_URL: PRIVATE_URL_BASE });
    if (settings instanceof ConfigError) return settings;
    return makeS3Storage(settings);
  }
  return new ConfigError({ key: 'STORAGE_DRIVER', reason: `unknown driver "${driver}" (local | s3 | r2)` });
}

/** Stockage privé résolu (configuration invalide → service dont chaque opération échoue). */
export const resolvePrivateStorage = (env: Readonly<Record<string, string | undefined>>): StorageShape => {
  const storage = privateStorageFromEnv(env);
  return storage instanceof ConfigError ? unavailable(storage, 'local') : storage;
};

/** Pour les frontières hors runtime partagé (actions, routes) : `Effect.provideService(PrivateStorage, privateStorage())`. */
export const privateStorage = (): StorageShape => resolvePrivateStorage(process.env);

export const PrivateStorageLive = Layer.effect(PrivateStorage, AppConfig.use((config) => Effect.sync(() => resolvePrivateStorage(config.env))));
