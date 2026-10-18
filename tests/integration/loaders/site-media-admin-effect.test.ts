/**
 * site / media / blog-admin* loaders — lectures Effect-natives contre un vrai Postgres :
 * médias avec textes alternatifs, arbre de dossiers, comptes ; réglages du site ; liste admin
 * du blog avec statistiques, compte de modération, données d'éditeur. Promise = Effect.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { blogComments, blogPosts, blogPostTranslations, mediaFileAlts, mediaFiles, mediaFolders, user } from '@database/schemas';
import * as media from '@database/loaders/media.loader';
import * as site from '@database/loaders/site.loader';
import * as admin from '@database/loaders/blog-admin.loader';
import * as moderation from '@database/loaders/blog-admin-moderation.loader';
import * as editor from '@database/loaders/blog-admin-editor.loader';

const t = `smaeff-${crypto.randomUUID().slice(0, 8)}`;
const parentFolder = crypto.randomUUID();
const childFolder = crypto.randomUUID();
const file = crypto.randomUUID();
const author = `${t}-author`;
const post = crypto.randomUUID();
const run = <A, E>(fx: Effect.Effect<A, E>) => Effect.runPromise(fx);

beforeAll(async () => {
  const db = getDrizzle();
  await db.insert(mediaFolders).values([
    { id: parentFolder, name: `${t}-parent` },
    { id: childFolder, name: `${t}-child`, parentId: parentFolder },
  ] as never);
  await db.insert(mediaFiles).values({ id: file, folderId: childFolder, filename: `${t}.png`, url: `/uploads/${t}.png`, mimeType: 'image/png', size: 10 } as never);
  await db.insert(mediaFileAlts).values({ fileId: file, locale: 'fr', alt: 'Texte alt' } as never);
  await db.insert(user).values({ id: author, name: `${t} Author`, email: `${author}@example.test` });
  await db.insert(blogPosts).values({ id: post, authorId: author, slug: `${t}-post`, status: 'DRAFT', isFeatured: true });
  await db.insert(blogPostTranslations).values({ postId: post, locale: 'fr', title: `${t} Titre`, slug: `${t}-fr`, content: 'x' } as never);
  await db.insert(blogComments).values({ postId: post, authorId: author, content: 'à modérer', status: 'PENDING' });
});

afterAll(async () => {
  const db = getDrizzle();
  await db.delete(mediaFiles).where(inArray(mediaFiles.id, [file]));
  await db.delete(mediaFolders).where(inArray(mediaFolders.id, [childFolder, parentFolder]));
  await db.delete(blogPosts).where(inArray(blogPosts.id, [post]));
  await db.delete(user).where(inArray(user.id, [author]));
});

describe('media.loader Effect-natif', () => {
  it('fichiers d’un dossier avec alts, fichier seul, arbre, comptes, stats', async () => {
    const fx = media.mediaLoaderEffects;
    const files = await run(fx.getMediaFilesByFolder(childFolder));
    expect(files).toEqual([expect.objectContaining({ id: file, alts: [{ locale: 'fr', alt: 'Texte alt', title: null }] })]);
    expect(await media.getMediaFile(file)).toEqual(files[0]);
    expect(await run(fx.getMediaFile(crypto.randomUUID()))).toBeNull();
    const tree = await run(fx.getMediaFolders(null));
    const parent = tree.find((n) => n.id === parentFolder);
    expect(parent?.children.map((c) => c.id)).toEqual([childFolder]);
    expect((await run(fx.getMediaFoldersList(null))).some((f) => f.id === childFolder)).toBe(true);
    expect((await run(fx.getMediaFileCountsByFolder(null))).get(childFolder)).toBe(1);
    const stats = await run(fx.getMediaStats(null));
    expect(stats.totalFiles).toBeGreaterThanOrEqual(1);
    expect(stats.totalFolders).toBeGreaterThanOrEqual(2);
    expect((await run(fx.getAllMediaFiles(null))).some((f) => f.id === file)).toBe(true);
  });
});

describe('site.loader Effect-natif', () => {
  it('locale invalide → null ; listes et thème : Promise (cache) = Effect', async () => {
    const fx = site.siteLoaderEffects;
    expect(await run(fx.getSiteSettings('xx'))).toBeNull();
    expect(await site.getSiteSettings('fr')).toEqual(await run(fx.getSiteSettings('fr')));
    expect(await site.getSocialLinks()).toEqual(await run(fx.getSocialLinks()));
    expect(await site.getOpeningHours()).toEqual(await run(fx.getOpeningHours()));
    expect(typeof (await run(fx.getActiveThemeCss()))).toBe('string');
    expect(Array.isArray(await run(fx.getAllThemes()))).toBe(true);
  });
});

describe('blog-admin* Effect-natifs', () => {
  it('liste admin filtrée + stats, auteurs, tags, modération, éditeur', async () => {
    const data = await run(admin.blogAdminLoaderEffects.getBlogAdminPostData(null, 'fr', { search: t, limit: 10 }));
    expect(data.rows.map((r) => r.post.id)).toEqual([post]);
    expect(data.rows[0]).toMatchObject({ translation: { title: `${t} Titre` }, author: { id: author }, categories: [] });
    expect(data.meta).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    expect(data.stats.draft).toBeGreaterThanOrEqual(1);
    expect(data.stats.featured).toBeGreaterThanOrEqual(1);
    expect(await admin.getBlogAdminPostData(null, 'fr', { search: t, limit: 10 })).toEqual(data);
    expect((await admin.getBlogAdminAuthors(null)).some((a) => a.id === author)).toBe(true);
    expect(Array.isArray(await admin.getBlogAdminTags(null, 'fr'))).toBe(true);

    expect(await moderation.getBlogAdminModerationCount(null)).toBeGreaterThanOrEqual(1);

    const ed = await editor.getBlogPostEditorData(post, 'fr');
    expect(ed).toMatchObject({ post: { id: post }, seo: null, links: [] });
    expect(await run(editor.blogAdminEditorEffects.getBlogPostEditorData(crypto.randomUUID(), 'fr'))).toBeNull();
  });
});
