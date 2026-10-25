import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Effect, Exit } from 'effect';
import { buildEnv, parseTemplate, scaffold, setEnv, shouldCopy } from '../../packages/create-polyweb/src/scaffold';
import { parseArgs } from '../../packages/create-polyweb/src/args';

const root = resolve(__dirname, '../..');
const work = mkdtempSync(join(tmpdir(), 'create-polyweb-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const base = { name: 'mon-site', from: root, adapter: 'node', storage: 'local', search: 'postgres', payments: false, siteName: 'Mon site', install: false, git: false };

describe('create-polyweb helpers (brick n)', () => {
  it('excludes secrets, builds and dependencies', () => {
    for (const p of ['.env', '.env.local', 'node_modules/x', 'dist/a', 'logs/x.log', 'test-results/a', 'tests/reports/r.json', 'packages/create-polyweb/src/index.ts', 'public/uploads/a.png', 'src/.astro/x', 'backups/b.tar.gz', 'tmp-new-module-abc/src/x.ts', 'tmp']) expect(shouldCopy(p), p).toBe(false);
    for (const p of ['.env.example', 'src/pages/index.astro', 'tests/unit/a.test.ts', 'packages/other/x', 'src/tmp/x.ts']) expect(shouldCopy(p), p).toBe(true);
  });
  it('parses templates, args and env lines', () => {
    expect(parseTemplate('github:polbotweb/polyweb#v1.2')).toEqual({ kind: 'github', owner: 'polbotweb', repo: 'polyweb', ref: 'v1.2' });
    expect(parseTemplate('./x').kind).toBe('local');
    expect(parseArgs(['site', '--storage', 'r2', '--search=meilisearch', '--payments', '--no-install', '-y', '--site-name', 'A B'])).toEqual({
      help: false, yes: true, values: { directory: 'site', storage: 'r2', search: 'meilisearch', payments: true, install: false, siteName: 'A B' },
    });
    expect(setEnv('A=1\n# B=2\n', 'B', 'x')).toBe('A=1\nB=x\n');
    expect(setEnv('A=1', 'C', 'y')).toBe('A=1\nC=y\n');
    const env = buildEnv('BETTER_AUTH_SECRET=replace-me\n# SEARCH_DRIVER=postgres\n', { ...base, search: 'meilisearch' } as never, 'mon-site');
    expect(env).toMatch(/^BETTER_AUTH_SECRET=[\w-]{43}$/m);
    expect(env).toMatch(/^SEARCH_DRIVER=meilisearch$/m);
    expect(env).toMatch(/^DATABASE_URL_LOCAL=postgresql:\/\/postgres:postgres@localhost:5432\/mon_site$/m);
  });
  it('rejects invalid options and non-empty targets', async () => {
    const bad = await Effect.runPromiseExit(scaffold({ ...base, directory: join(work, 'x'), storage: 'ftp' }));
    expect(Exit.isFailure(bad)).toBe(true);
    const busy = join(work, 'busy');
    mkdirSync(busy);
    writeFileSync(join(busy, 'file'), '');
    const exit = await Effect.runPromiseExit(scaffold({ ...base, directory: busy }));
    expect(JSON.stringify(exit)).toContain("n'est pas vide");
  });
});

describe('create-polyweb end to end (built CLI, local template)', () => {
  const dest = join(work, 'site-cli');
  beforeAll(() => {
    execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, 'packages/create-polyweb/tsconfig.json')], { stdio: 'pipe' });
  }, 60_000);

  it('creates a project with renamed package, fresh secrets and a git commit', () => {
    const out = execFileSync(process.execPath, [join(root, 'packages/create-polyweb/dist/index.js'), dest, '--yes', '--from', root, '--no-install', '--name', 'acme-site', '--site-name', 'Acme', '--storage', 'r2', '--search', 'pagefind', '--payments'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(out).toContain('Projet « acme-site » créé');
    expect(out).toContain('search:pagefind');
    const pkg = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8'));
    expect(pkg).toMatchObject({ name: 'acme-site', version: '0.1.0', private: true });
    const env = readFileSync(join(dest, '.env'), 'utf8');
    expect(env).toMatch(/^STORAGE_DRIVER=r2$/m);
    expect(env).toMatch(/^PAYMENTS_ENABLED=true$/m);
    expect(env).toMatch(/^SITE_NAME=Acme$/m);
    // Le secret du projet source (.env local, ou .env.example en CI où aucun .env n'existe) ne doit pas être recopié.
    const sourceEnvFile = existsSync(join(root, '.env')) ? join(root, '.env') : join(root, '.env.example');
    const sourceSecret = /^BETTER_AUTH_SECRET=(.*)$/m.exec(readFileSync(sourceEnvFile, 'utf8'))?.[1];
    const generatedSecret = /^BETTER_AUTH_SECRET=(.*)$/m.exec(env)?.[1];
    expect(generatedSecret, 'BETTER_AUTH_SECRET généré').toBeTruthy();
    if (sourceSecret) expect(generatedSecret).not.toBe(sourceSecret);
    expect(statSync(join(dest, '.env')).mode & 0o777).toBe(0o600);
    for (const p of ['node_modules', 'dist', 'logs', 'test-results', 'packages/create-polyweb']) expect(existsSync(join(dest, p)), p).toBe(false);
    for (const p of ['src/middleware.ts', 'astro.config.mjs', '.env.example', 'AGENTS.md']) expect(existsSync(join(dest, p)), p).toBe(true);
    expect(execFileSync('git', ['log', '--oneline'], { cwd: dest, encoding: 'utf8' })).toContain('create-polyweb');
    expect(execFileSync('git', ['ls-files', '.env'], { cwd: dest, encoding: 'utf8' }).trim()).toBe('');
  }, 120_000);

  it('prints help', () => {
    expect(execFileSync(process.execPath, [join(root, 'packages/create-polyweb/dist/index.js'), '--help'], { encoding: 'utf8' })).toContain('--storage local|s3|r2');
  });
});
