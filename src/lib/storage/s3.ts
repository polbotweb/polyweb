/**
 * Driver S3 / Cloudflare R2 (brique e) — via @aws-sdk/client-s3.
 *
 * R2 : S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com, S3_REGION=auto,
 * S3_PUBLIC_URL=https://<domaine public du bucket ou CDN>.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Duration, Effect } from 'effect';
import { StorageError, validateKey, type StorageShape, type StoredObject } from './storage';

export interface S3Settings {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint?: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly forcePathStyle: boolean;
  /** Base publique des objets (CDN, domaine R2). Sans slash final. */
  readonly publicUrl: string;
  /** Préfixe optionnel dans le bucket (`polyweb/`). */
  readonly prefix: string;
  readonly timeoutMs: number;
}

export function makeS3Storage(settings: S3Settings, client?: S3Client): StorageShape {
  const s3 =
    client ??
    new S3Client({
      region: settings.region,
      endpoint: settings.endpoint,
      forcePathStyle: settings.forcePathStyle,
      credentials:
        settings.accessKeyId && settings.secretAccessKey
          ? { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey }
          : undefined,
      // R2 et la plupart des compatibles S3 ne gèrent pas les checksums CRC « flexibles » par défaut.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 3,
    });
  const full = (key: string) => `${settings.prefix}${key}`;
  const call = <A>(operation: string, key: string, f: (signal: AbortSignal) => Promise<A>) =>
    Effect.tryPromise({ try: f, catch: (cause) => new StorageError({ operation, key, cause }) }).pipe(
      Effect.timeoutOrElse({
        duration: Duration.millis(settings.timeoutMs),
        orElse: () => Effect.fail(new StorageError({ operation, key, cause: `timeout after ${settings.timeoutMs}ms` })),
      }),
      Effect.withSpan(`storage.s3.${operation}`, { attributes: { key } }),
    );

  const publicUrl = (key: string) => `${settings.publicUrl}/${full(key)}`;

  return {
    driver: 's3',
    put: (key, body, options) =>
      Effect.flatMap(validateKey(key), () =>
        call('put', key, (abortSignal) =>
          s3.send(
            new PutObjectCommand({
              Bucket: settings.bucket,
              Key: full(key),
              Body: body,
              ContentType: options.contentType,
              CacheControl: options.cacheControl,
            }),
            { abortSignal },
          ),
        ).pipe(Effect.as({ key, url: publicUrl(key) })),
      ),
    get: (key) =>
      Effect.flatMap(validateKey(key), () =>
        call('get', key, async (abortSignal) => {
          const res = await s3.send(new GetObjectCommand({ Bucket: settings.bucket, Key: full(key) }), { abortSignal });
          return res.Body ? await res.Body.transformToByteArray() : new Uint8Array();
        }),
      ),
    remove: (key) =>
      Effect.flatMap(validateKey(key), () =>
        call('remove', key, (abortSignal) => s3.send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: full(key) }), { abortSignal })).pipe(Effect.asVoid),
      ),
    list: (prefix) =>
      Effect.flatMap(validateKey(prefix, { allowEmpty: true, allowTrailingSlash: true }), () =>
        call('list', prefix, async (abortSignal) => {
          const out: StoredObject[] = [];
          let token: string | undefined;
          do {
            const res = await s3.send(
              new ListObjectsV2Command({ Bucket: settings.bucket, Prefix: full(prefix), ContinuationToken: token }),
              { abortSignal },
            );
            for (const o of res.Contents ?? []) {
              if (!o.Key) continue;
              out.push({ key: o.Key.slice(settings.prefix.length), size: o.Size ?? 0, lastModified: o.LastModified ?? new Date(0) });
            }
            token = res.IsTruncated ? res.NextContinuationToken : undefined;
          } while (token);
          return out;
        }),
      ),
    publicUrl,
    keyFromUrl: (url) => {
      const base = `${settings.publicUrl}/${settings.prefix}`;
      return url.startsWith(base) ? url.slice(base.length) : null;
    },
  };
}
