/**
 * Briques a (blocs typés) et e (stockage médias) sur Postgres réel :
 * - a : un document de blocs persiste dans une entrée, est relu depuis la base
 *   et rendu en HTML sûr (texte échappé, bloc inconnu refusé à l'écriture) ;
 * - e : le pipeline Effect `prepareUpload` → `storeUpload` écrit l'original et
 *   ses variantes WebP via le service `Storage` (driver local, dossier
 *   temporaire), puis la ligne `media_files` est enregistrée et relue par le
 *   loader `getMediaFile` (via sa façade Effect).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Layer } from 'effect';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { mediaFiles } from '@database/schemas';
import { renderBlocksToHtml } from '@/core/blocks';
import { createEntry, getEntry } from '@/modules/content/domain/entries';
import type { ContentType } from '@/modules/content/domain/content-types';
import type { Site } from '@/modules/sites/domain/sites';
import { Storage } from '@/lib/storage';
import { makeLocalStorage } from '@/lib/storage/local';
import { prepareUpload, storeUpload } from '@/media/upload';
import { serializeVariants } from '@/media/variants';
import { MediaLoaderEffect } from '@/database/loaders/effect';
import { createArticleType, createTestSite, removeTestSite } from '../../helpers/platform';

let site: Site;
let type: ContentType;
let dir: string;
const createdMedia: string[] = [];

beforeAll(async () => {
  site = await createTestSite('blocks-media');
  type = await createArticleType(site.id);
  dir = await mkdtemp(join(tmpdir(), 'polyweb-media-'));
});

afterAll(async () => {
  for (const id of createdMedia) await getDrizzle().delete(mediaFiles).where(eq(mediaFiles.id, id));
  await removeTestSite(site.id);
  await rm(dir, { recursive: true, force: true });
});

describe('brique a — blocs persistés puis rendus', () => {
  it('relit les blocs depuis Postgres et produit un HTML échappé', async () => {
    const blocks = {
      version: 1 as const,
      blocks: [
        { id: 'h', type: 'heading', data: { level: 2, text: 'Titre <script>alert(1)</script>' } },
        {
          id: 'r',
          type: 'richText',
          data: { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Paragraphe & co' }] }] } },
        },
      ],
    };
    const entry = await createEntry(
      type,
      { translations: { fr: { title: 'Blocs', data: { summary: 's' }, blocks } } },
      { authorId: null, allowedLocales: ['fr'] },
    );
    const full = await getEntry(type, entry.id);
    const stored = full!.translations.find((t) => t.locale === 'fr')!.blocks!;
    expect(stored.blocks.map((b) => b.type)).toEqual(['heading', 'richText']);
    const html = renderBlocksToHtml(stored);
    expect(html).toContain('<h2');
    expect(html).toContain('Paragraphe &amp; co');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('brique e — upload via Storage puis ligne media_files', () => {
  it('écrit original + variantes et enregistre le média', async () => {
    const png = await sharp({ create: { width: 700, height: 350, channels: 3, background: '#3366cc' } }).png().toBuffer();
    const file = new File([png], 'Bannière test.png', { type: 'image/png' });

    const prepared = await prepareUpload(file, { subDir: 'media', maxSize: 5 * 1024 * 1024 });
    const storage = Layer.succeed(Storage, makeLocalStorage(dir, '/uploads'));
    const result = await Effect.runPromise(storeUpload(prepared).pipe(Effect.provide(storage)));

    expect(result.dimensions).toEqual({ width: 700, height: 350 });
    const written = await readdir(join(dir, prepared.key.slice(0, prepared.key.lastIndexOf('/'))));
    expect(result.path).toBe(join(dir, prepared.key));
    expect(written.some((f) => f.endsWith('.png'))).toBe(true);
    expect(written.filter((f) => f.endsWith('.webp')).length).toBeGreaterThanOrEqual(2);
    expect(result.variants.map((v) => v.width)).toEqual([320, 640, 700]);
    for (const v of result.variants) expect(v.url.startsWith('/uploads/')).toBe(true);

    const [row] = await getDrizzle()
      .insert(mediaFiles)
      .values({
        filename: result.filename,
        url: result.url,
        mimeType: 'image/png',
        size: (await stat(result.path)).size,
        width: result.dimensions!.width,
        height: result.dimensions!.height,
        variants: serializeVariants(result.variants),
      })
      .returning();
    createdMedia.push(row!.id);

    const loaded = await Effect.runPromise(MediaLoaderEffect.getMediaFile(row!.id));
    expect(loaded?.url).toBe(result.url);
    expect(loaded?.width).toBe(700);
    const [persisted] = await getDrizzle().select({ variants: mediaFiles.variants }).from(mediaFiles).where(eq(mediaFiles.id, row!.id));
    expect(persisted!.variants!.map((v) => v.width)).toEqual([320, 640, 700]);
  });
});
