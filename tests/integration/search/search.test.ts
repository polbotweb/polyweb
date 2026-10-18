import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { Effect } from 'effect';
import { appRuntime } from '@/lib/effect/runtime';
import { Db } from '@/lib/effect/db';
import { makePostgresSearch } from '@/lib/search/postgres';
import { makeMeiliSearch } from '@/lib/search/meilisearch';
import { SearchIndex, safeHighlight, documentId, type SearchIndexShape } from '@/lib/search';
import { reindex, registerSearchIndexer } from '@/lib/search/indexer';
import { contentDocumentsForSite, textOf } from '@/lib/search/sources';
import { writePagefindIndex } from '@/lib/search/pagefind';
import { createEntry, setEntryStatus, deleteEntry } from '@/modules/content/domain/entries';
import { createTestSite, removeTestSite, createArticleType, sampleBlocks } from '../../helpers/platform';
import type { Site } from '@/modules/sites/domain/sites';
import type { ContentType } from '@/modules/content/domain/content-types';

let site: Site;
let type: ContentType;
const opts = { authorId: null, allowedLocales: ['fr', 'en'] };
const run = <A, E>(e: Effect.Effect<A, E, any>) => appRuntime.runPromise(e as Effect.Effect<A, E, never>);
const withIndex = <A, E>(index: SearchIndexShape, e: Effect.Effect<A, E, any>) => run(Effect.provideService(e, SearchIndex, index));

beforeAll(async () => {
  site = await createTestSite('search');
  type = await createArticleType(site.id);
  const a = await createEntry(type, { slug: 'jardinage', translations: { fr: { title: 'Guide du jardinage', data: { summary: 'Planter des tomates <script>alert(1)</script> au printemps' }, blocks: sampleBlocks }, en: { title: 'Gardening guide', data: { summary: 'Planting tomatoes in spring' } } } }, opts);
  await setEntryStatus(type, a.id, 'published', null);
  await createEntry(type, { slug: 'brouillon', translations: { fr: { title: 'Brouillon tomates', data: { summary: 'non publié' } } } }, opts);
});
afterAll(async () => {
  await removeTestSite(site.id);
});

describe('search helpers', () => {
  it('escapes highlights and builds safe ids', () => {
    expect(safeHighlight('a <b> \u0001tom\u0002')).toBe('a &lt;b&gt; <mark>tom</mark>');
    expect(documentId('content', 'a:b/c', 'fr')).toBe('content_a-b-c_fr');
    expect(textOf({ type: 'doc', content: [{ type: 'text', text: 'x' }, { attrs: { src: 'y' } }] })).toBe('x');
  });
});

describe('postgres driver (brick k)', () => {
  it('reindexes published entries only, per locale, with ranking and escaped highlight', async () => {
    const index = await run(Effect.gen(function* () { return makePostgresSearch(yield* Db); }));
    const counts = await withIndex(index, reindex([site.id]));
    expect(counts[site.id]).toBe(2);
    const fr = await run(index.search({ q: 'tomate', siteId: site.id, locale: 'fr' }));
    expect(fr.total).toBe(1);
    expect(fr.hits[0]).toMatchObject({ kind: 'content', type: 'article', url: '/fr/c/article/jardinage', title: 'Guide du jardinage' });
    expect(fr.hits[0]!.highlight).toContain('<mark>');
    expect(fr.hits[0]!.highlight).not.toContain('<script>');
    const en = await run(index.search({ q: 'tomatoes', siteId: site.id, locale: 'en' }));
    expect(en.hits.map((h) => h.url)).toEqual(['/en/c/article/jardinage']);
    // préfixe sur le dernier mot + texte des blocs
    expect((await run(index.search({ q: 'bonjour mon', siteId: site.id, locale: 'fr' }))).total).toBe(1);
    expect((await run(index.search({ q: 'tomate', siteId: site.id, locale: 'fr', kinds: ['blog_post'] }))).total).toBe(0);
    expect((await run(index.search({ q: 'tomate', siteId: 'other', locale: 'fr' }))).total).toBe(0);
  });

  it('follows content events (publish, unpublish, delete)', async () => {
    registerSearchIndexer();
    const index = await run(Effect.gen(function* () { return makePostgresSearch(yield* Db); }));
    const e = await createEntry(type, { slug: 'courgettes', translations: { fr: { title: 'Courgettes farcies', data: { summary: 'recette' } } } }, opts);
    expect((await run(index.search({ q: 'courgettes', siteId: site.id, locale: 'fr' }))).total).toBe(0);
    await setEntryStatus(type, e.id, 'published', null);
    expect((await run(index.search({ q: 'courgettes', siteId: site.id, locale: 'fr' }))).total).toBe(1);
    await setEntryStatus(type, e.id, 'draft', null);
    expect((await run(index.search({ q: 'courgettes', siteId: site.id, locale: 'fr' }))).total).toBe(0);
    await setEntryStatus(type, e.id, 'published', null);
    await deleteEntry(type, e.id);
    expect((await run(index.search({ q: 'courgettes', siteId: site.id, locale: 'fr' }))).total).toBe(0);
  });
});

describe('pagefind export (brick k)', () => {
  it('writes a static index from the documents', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pf-'));
    try {
      const docs = await run(contentDocumentsForSite(site.id));
      const r = await run(writePagefindIndex(docs, dir));
      expect(r.added).toBe(docs.length);
      expect(readdirSync(dir)).toContain('pagefind.js');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

const MEILI_BIN = process.env.MEILI_TEST_BIN;
describe.skipIf(!MEILI_BIN || !existsSync(MEILI_BIN))('meilisearch driver (real binary, MEILI_TEST_BIN)', () => {
  let proc: ChildProcess;
  let dataDir: string;
  let host: string;
  beforeAll(async () => {
    const port = await new Promise<number>((res) => { const s = createServer(); s.listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
    dataDir = mkdtempSync(join(tmpdir(), 'meili-'));
    host = `http://127.0.0.1:${port}`;
    proc = spawn(MEILI_BIN!, ['--http-addr', `127.0.0.1:${port}`, '--db-path', join(dataDir, 'db'), '--no-analytics', '--master-key', 'test-master-key-0123456789'], { cwd: dataDir, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${host}/health`)).ok) return; } catch { /* démarrage */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('meilisearch did not start');
  }, 20_000);
  afterAll(() => { proc?.kill(); rmSync(dataDir, { recursive: true, force: true }); });

  it('indexes, filters by site/locale/kind, highlights safely, removes and clears', async () => {
    const index = makeMeiliSearch({ host, apiKey: 'test-master-key-0123456789', index: 'polyweb_test', timeoutMs: 5000 });
    const counts = await withIndex(index, reindex([site.id]));
    expect(counts[site.id]).toBe(2);
    const fr = await run(index.search({ q: 'tomates', siteId: site.id, locale: 'fr' }));
    expect(fr.total).toBe(1);
    expect(fr.hits[0]!.url).toBe('/fr/c/article/jardinage');
    expect(fr.hits[0]!.highlight).toContain('<mark>');
    expect(fr.hits[0]!.highlight).not.toContain('<script>');
    expect((await run(index.search({ q: 'tomates', siteId: 'x"y', locale: 'fr' }))).total).toBe(0);
    expect((await run(index.search({ q: 'tomates', siteId: site.id, locale: 'fr', kinds: ['page'] }))).total).toBe(0);
    await run(index.remove([fr.hits[0]!.id]));
    expect((await run(index.search({ q: 'tomates', siteId: site.id, locale: 'fr' }))).total).toBe(0);
    await run(index.clear(site.id));
    expect((await run(index.search({ q: 'tomatoes', siteId: site.id, locale: 'en' }))).total).toBe(0);
    const bad = makeMeiliSearch({ host, apiKey: 'wrong', index: 'polyweb_test', timeoutMs: 2000 });
    const exit = await appRuntime.runPromiseExit(bad.search({ q: 'x1', siteId: site.id, locale: 'fr' }));
    expect(exit._tag).toBe('Failure');
  }, 60_000);
});
