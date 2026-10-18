import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { appRuntime } from '@/lib/effect/runtime';
import { Storage, type StorageShape } from '@/lib/storage';
import { createBackup, inspectBackup, pgEnvFromUrl, pruneBackups, restoreBackup } from '@/lib/backup/backup';
import { knownMigrations } from '@/lib/backup/migrations';
import { getDbUrl } from '@database/env';

const out = mkdtempSync(join(tmpdir(), 'pw-backups-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

function memoryStorage(initial: Record<string, string> = {}): StorageShape & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>(Object.entries(initial).map(([k, v]) => [k, new TextEncoder().encode(v)]));
  return {
    files,
    driver: 'local',
    put: (key, body) => Effect.sync(() => { files.set(key, body); return { key, url: `/uploads/${key}` }; }),
    get: (key) => Effect.sync(() => files.get(key)!),
    remove: (key) => Effect.sync(() => void files.delete(key)),
    list: () => Effect.sync(() => [...files.entries()].map(([key, b]) => ({ key, size: b.byteLength, lastModified: new Date() }))),
    publicUrl: (key) => `/uploads/${key}`,
    keyFromUrl: (url) => url.replace('/uploads/', ''),
  } as StorageShape & { files: Map<string, Uint8Array> };
}

const run = <A, E>(e: Effect.Effect<A, E, any>, storage?: StorageShape) =>
  appRuntime.runPromise((storage ? Effect.provideService(e, Storage, storage) : e) as Effect.Effect<A, E, never>);

describe('backup helpers (brick m)', () => {
  it('maps DATABASE_URL to PG* env without exposing the password in argv', () => {
    expect(pgEnvFromUrl('postgresql://u%40x:p%23w@db.host:6543/app?sslmode=require')).toEqual({ PGHOST: 'db.host', PGPORT: '6543', PGDATABASE: 'app', PGUSER: 'u@x', PGPASSWORD: 'p#w', PGSSLMODE: 'require' });
    expect(() => pgEnvFromUrl('mysql://x@y/z')).toThrow();
  });
  it('lists shipped migrations', () => {
    const m = knownMigrations();
    expect(m[0]).toMatch(/^0000_/);
    expect(m).toContain('0018_search_documents');
  });
  it('prunes old archives', async () => {
    const d = mkdtempSync(join(tmpdir(), 'pw-prune-'));
    for (const n of ['20260101-000000Z', '20260102-000000Z', '20260103-000000Z']) writeFileSync(join(d, `polyweb-${n}.tar.gz`), '');
    writeFileSync(join(d, 'other.txt'), '');
    const removed = await run(pruneBackups(d, 2));
    expect(removed).toEqual(['polyweb-20260101-000000Z.tar.gz']);
    expect(readdirSync(d).sort()).toEqual(['other.txt', 'polyweb-20260102-000000Z.tar.gz', 'polyweb-20260103-000000Z.tar.gz']);
    rmSync(d, { recursive: true, force: true });
  });
});

describe('backup → verify (brick m)', () => {
  let archive = '';
  it('creates an archive with manifest, checksum, migrations and media', async () => {
    const storage = memoryStorage({ 'images/a.webp': 'AAA', 'docs/b.pdf': 'BB', '.gitkeep': '' });
    const r = await run(createBackup({ databaseUrl: getDbUrl(), outDir: out, includeMedia: true, release: 'test', now: new Date('2026-10-18T09:00:00Z') }), storage);
    archive = r.archive;
    expect(r.archive).toMatch(/polyweb-20261018-090000Z\.tar\.gz$/);
    expect(r.manifest.media).toEqual({ included: true, count: 2, bytes: 5 });
    expect(r.manifest.database.migrations).toContain('0018_search_documents');
    const listing = execFileSync('tar', ['-tzf', r.archive], { encoding: 'utf8' });
    expect(listing).toContain('manifest.json');
    expect(listing).toContain('db.dump');
    expect(listing).toContain('media/images/a.webp');
    const inspected = await run(inspectBackup(r.archive));
    expect(inspected.manifest.database.sha256).toMatch(/^[0-9a-f]{64}$/);
    rmSync(inspected.work, { recursive: true, force: true });
  }, 120_000);

  it('rejects a tampered archive and a backup newer than the code', async () => {
    const d = mkdtempSync(join(tmpdir(), 'pw-tamper-'));
    execFileSync('tar', ['-xzf', archive, '-C', d]);
    writeFileSync(join(d, 'db.dump'), 'corrompu');
    const bad = join(d, 'bad.tar.gz');
    execFileSync('tar', ['-czf', bad, '-C', d, 'manifest.json', 'db.dump']);
    const exit = await appRuntime.runPromiseExit(inspectBackup(bad));
    expect(exit._tag).toBe('Failure');
    expect(JSON.stringify(exit)).toContain('somme de contrôle');
    const compat = await appRuntime.runPromiseExit(restoreBackup({ archive, databaseUrl: 'postgresql://nobody@127.0.0.1:1/none', restoreMedia: false, knownMigrations: ['0000_x'] }));
    expect(JSON.stringify(compat)).toContain('plus récente que le code');
    // archive forgée avec chemin remontant
    const evil = join(d, 'evil.tar.gz');
    execFileSync('tar', ['-czf', evil, '-C', d, '-P', '--transform', 's,^,../,', 'manifest.json']);
    expect(JSON.stringify(await appRuntime.runPromiseExit(inspectBackup(evil)))).toContain('interdite');
    rmSync(d, { recursive: true, force: true });
  }, 60_000);

  const target = process.env.RESTORE_TEST_DATABASE_URL;
  it.skipIf(!target)('restores into a scratch database (RESTORE_TEST_DATABASE_URL) with media', async () => {
    const storage = memoryStorage();
    const r = await run(restoreBackup({ archive, databaseUrl: target!, restoreMedia: true, knownMigrations: knownMigrations() }), storage);
    expect(r.mediaRestored).toBe(2);
    expect(new TextDecoder().decode(storage.files.get('images/a.webp'))).toBe('AAA');
    const count = (url: string, sql: string) => execFileSync('psql', ['-X', '-A', '-t', '-c', sql], { env: { ...process.env, ...pgEnvFromUrl(url) }, encoding: 'utf8' }).trim();
    for (const sql of ['SELECT count(*) FROM sites', 'SELECT count(*) FROM __drizzle_migrations', "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"]) {
      expect(count(target!, sql)).toBe(count(getDbUrl(), sql));
    }
    // Restauration idempotente (deuxième passage sur une base non vide)
    await run(restoreBackup({ archive, databaseUrl: target!, restoreMedia: false, knownMigrations: knownMigrations() }), storage);
    expect(count(target!, 'SELECT count(*) FROM sites')).toBe(count(getDbUrl(), 'SELECT count(*) FROM sites'));
  }, 180_000);
});
