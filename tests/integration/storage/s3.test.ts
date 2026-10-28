/**
 * Driver S3/R2 testé contre un serveur compatible S3 réel en local (SeaweedFS, voir scripts/s3-test-server.mjs).
 * S3_TEST_ENDPOINT=http://… permet de cibler un serveur S3 déjà lancé (bucket « polyweb » créé si absent).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { Effect } from 'effect';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { startSeaweedS3 } from '../../../scripts/s3-test-server.mjs';
import { makeS3Storage } from '@/lib/storage/s3';
import { s3SettingsFromEnv, storageFromEnv, storagePublicOrigin, Storage } from '@/lib/storage';
import { prepareUpload, storeUpload } from '@/media/upload';
import { deleteMediaByUrl } from '@/media/delete';
import { listMedia } from '@/media/list';
import { ConfigError } from '@/lib/effect/errors';

let stop: (() => Promise<void>) | undefined;
let endpoint: string;
const ACCESS_KEY = 'polyweb-test';
const SECRET_KEY = 'polyweb-test-secret';

beforeAll(async () => {
  if (process.env.S3_TEST_ENDPOINT) {
    endpoint = process.env.S3_TEST_ENDPOINT;
  } else {
    const server = await startSeaweedS3();
    endpoint = server.endpoint;
    stop = server.stop;
  }
  const client = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } });
  await client.send(new CreateBucketCommand({ Bucket: 'polyweb' })).catch((e: { name?: string }) => {
    if (e.name !== 'BucketAlreadyOwnedByYou' && e.name !== 'BucketAlreadyExists') throw e;
  });
  client.destroy();
}, 240_000);
afterAll(async () => {
  await stop?.();
});

const storage = () =>
  makeS3Storage({
    bucket: 'polyweb', region: 'us-east-1', endpoint, accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY,
    forcePathStyle: true, publicUrl: 'https://cdn.example.test', prefix: 'site-a/', timeoutMs: 10_000,
  });

describe('S3 storage driver', () => {
  it('puts, gets, lists (prefix), maps URLs and removes objects', async () => {
    const s = storage();
    const put = await Effect.runPromise(s.put('images/media/hello.txt', new TextEncoder().encode('hi'), { contentType: 'text/plain' }));
    expect(put.url).toBe('https://cdn.example.test/site-a/images/media/hello.txt');
    expect(s.keyFromUrl(put.url)).toBe('images/media/hello.txt');
    expect(s.keyFromUrl('https://elsewhere.test/x')).toBeNull();
    expect(new TextDecoder().decode(await Effect.runPromise(s.get('images/media/hello.txt')))).toBe('hi');
    const listed = await Effect.runPromise(s.list('images/media/'));
    expect(listed.map((o) => o.key)).toContain('images/media/hello.txt');
    await Effect.runPromise(s.remove('images/media/hello.txt'));
    expect((await Effect.runPromise(s.list('images/media/'))).map((o) => o.key)).not.toContain('images/media/hello.txt');
  });

  it('rejects unsafe keys and surfaces failures as StorageError', async () => {
    const s = storage();
    expect((await Effect.runPromise(Effect.flip(s.put('../etc/passwd', new Uint8Array(), { contentType: 'x' }))))._tag).toBe('InvalidStorageKeyError');
    expect((await Effect.runPromise(Effect.flip(s.get('images/missing.png'))))._tag).toBe('StorageError');
    const broken = makeS3Storage({ bucket: 'polyweb-missing-bucket', region: 'us-east-1', endpoint, accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY, forcePathStyle: true, publicUrl: 'https://x', prefix: '', timeoutMs: 5000 });
    expect((await Effect.runPromise(Effect.flip(broken.put('a.txt', new Uint8Array([1]), { contentType: 'text/plain' }))))._tag).toBe('StorageError');
  });

  it('runs the full media pipeline (validation → original + WebP variants → list → delete) on S3', async () => {
    const s = storage();
    const png = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#3366ff' } }).png().toBuffer();
    const file = new File([new Uint8Array(png)], 'photo.png', { type: 'image/png' });
    const prepared = await prepareUpload(file, { subDir: 'images/media' });
    const result = await Effect.runPromise(storeUpload(prepared).pipe(Effect.provideService(Storage, s)));
    expect(result.url).toMatch(/^https:\/\/cdn\.example\.test\/site-a\/images\/media\/[0-9a-f-]+\.png$/);
    expect(result.variants.length).toBeGreaterThan(0);
    expect(result.variants.every((v) => v.url.startsWith('https://cdn.example.test/site-a/images/media/'))).toBe(true);
    const keys = (await Effect.runPromise(s.list('images/media/'))).map((o) => o.key);
    expect(keys).toEqual(expect.arrayContaining([result.key, ...result.variants.map((v) => s.keyFromUrl(v.url)!)]));

    const files = await Effect.runPromise(listMedia('media').pipe(Effect.provideService(Storage, s)));
    expect(files.map((f) => f.url)).toContain(result.url);
    expect(files.some((f) => /-\d+\.webp$/.test(f.name))).toBe(false);

    await Effect.runPromise(deleteMediaByUrl(result.url).pipe(Effect.provideService(Storage, s)));
    const after = (await Effect.runPromise(s.list('images/media/'))).map((o) => o.key);
    expect(after.filter((k) => k.startsWith(result.key.replace(/\.png$/, '')))).toEqual([]);
  });
});

describe('storage configuration', () => {
  it('derives R2 / S3 settings from env and validates required keys', () => {
    expect(s3SettingsFromEnv({ STORAGE_DRIVER: 's3' })).toBeInstanceOf(ConfigError);
    expect(s3SettingsFromEnv({ STORAGE_DRIVER: 'r2', S3_BUCKET: 'b' })).toBeInstanceOf(ConfigError);
    const r2 = s3SettingsFromEnv({ STORAGE_DRIVER: 'r2', S3_BUCKET: 'b', S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com', S3_PUBLIC_URL: 'https://media.example.com/' });
    expect(r2).toMatchObject({ region: 'auto', forcePathStyle: false, publicUrl: 'https://media.example.com' });
    expect(s3SettingsFromEnv({ STORAGE_DRIVER: 's3', S3_BUCKET: 'b', S3_REGION: 'eu-west-3' })).toMatchObject({ publicUrl: 'https://b.s3.eu-west-3.amazonaws.com', forcePathStyle: false });
    expect(s3SettingsFromEnv({ STORAGE_DRIVER: 's3', S3_BUCKET: 'b', S3_PREFIX: 'x' })).toMatchObject({ prefix: 'x/' });
    expect(storagePublicOrigin({ STORAGE_DRIVER: 'r2', S3_BUCKET: 'b', S3_ENDPOINT: 'https://e', S3_PUBLIC_URL: 'https://media.example.com/p' })).toBe('https://media.example.com');
    expect(storagePublicOrigin({})).toBeNull();
    expect(storageFromEnv({}).driver).toBe('local');
    expect(() => storageFromEnv({ STORAGE_DRIVER: 'ftp' })).toThrow();
  });
});

describe('S3 private storage (documents comptables)', () => {
  it('bucket privé distinct : écriture/lecture sous préfixe, aucune URL publique', async () => {
    const { privateStorageFromEnv } = await import('@/lib/storage/private');
    const client = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } });
    await client.send(new CreateBucketCommand({ Bucket: 'polyweb-private' })).catch((e: { name?: string }) => {
      if (e.name !== 'BucketAlreadyOwnedByYou' && e.name !== 'BucketAlreadyExists') throw e;
    });
    client.destroy();
    const env = {
      STORAGE_DRIVER: 's3', S3_BUCKET: 'polyweb', S3_PRIVATE_BUCKET: 'polyweb-private', S3_PRIVATE_PREFIX: 'tenant-a/', S3_ENDPOINT: endpoint, S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: ACCESS_KEY, S3_SECRET_ACCESS_KEY: SECRET_KEY, S3_FORCE_PATH_STYLE: 'true', S3_PUBLIC_URL: 'https://cdn.example.test',
    };
    const priv = privateStorageFromEnv(env);
    if (priv instanceof ConfigError) throw priv;
    const bytes = new Uint8Array([0xa4, 0x0d, 0x0a]);
    const put = await Effect.runPromise(priv.put('fec/org-1/2026-03/732829320FEC20260331.txt', bytes, { contentType: 'text/plain; charset=ISO-8859-15', cacheControl: 'private, no-store' }));
    expect(put.url.startsWith('https://')).toBe(false);
    expect([...await Effect.runPromise(priv.get('fec/org-1/2026-03/732829320FEC20260331.txt'))]).toEqual([...bytes]);
    // Le bucket média public ne contient pas l'objet.
    const media = storage();
    expect((await Effect.runPromise(media.list('fec/'))).length).toBe(0);
    await Effect.runPromise(priv.remove('fec/org-1/2026-03/732829320FEC20260331.txt'));
    expect(await Effect.runPromise(priv.list('fec/'))).toEqual([]);
  });
});
