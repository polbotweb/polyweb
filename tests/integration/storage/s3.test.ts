/**
 * Driver S3/R2 testé contre un serveur compatible S3 réel en local (s3rver).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { Effect } from 'effect';
// @ts-expect-error — s3rver ne fournit pas de types
import S3rver from 's3rver';
import { makeS3Storage } from '@/lib/storage/s3';
import { s3SettingsFromEnv, storageFromEnv, storagePublicOrigin, Storage } from '@/lib/storage';
import { prepareUpload, storeUpload } from '@/media/upload';
import { deleteMediaByUrl } from '@/media/delete';
import { listMedia } from '@/media/list';
import { ConfigError } from '@/lib/effect/errors';

let server: { run(): Promise<{ port: number }>; close(): Promise<void> };
let dir: string;
let endpoint: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 's3rver-'));
  server = new S3rver({ port: 0, address: '127.0.0.1', silent: true, directory: dir, configureBuckets: [{ name: 'polyweb' }] });
  const { port } = await server.run();
  endpoint = `http://127.0.0.1:${port}`;
});
afterAll(async () => {
  await server.close();
  await rm(dir, { recursive: true, force: true });
});

const storage = () =>
  makeS3Storage({
    bucket: 'polyweb', region: 'us-east-1', endpoint, accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER',
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
    const broken = makeS3Storage({ bucket: 'nope', region: 'us-east-1', endpoint, accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER', forcePathStyle: true, publicUrl: 'https://x', prefix: '', timeoutMs: 5000 });
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
