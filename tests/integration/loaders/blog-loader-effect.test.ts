/**
 * blog.loader — lectures Effect-natives (dbTry) et adaptateurs Promise : mêmes résultats,
 * contre un vrai Postgres (commentaires imbriqués, avis + vote du lecteur, statistiques,
 * liens, galeries) ; un brouillon reste invisible.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import {
  blogCategories, blogComments, blogPostCategories, blogPostReviewHelpful, blogPostReviews, blogPosts,
  blogPostTags, blogPostTranslations, blogTags, user,
} from '@database/schemas';
import * as blog from '@database/loaders/blog.loader';

const t = `blgeff-${crypto.randomUUID().slice(0, 8)}`;
const author = `${t}-author`;
const reader = `${t}-reader`;
const post = crypto.randomUUID();
const draft = crypto.randomUUID();
const root = crypto.randomUUID();
const review = crypto.randomUUID();

beforeAll(async () => {
  const db = getDrizzle();
  await db.insert(user).values([
    { id: author, name: 'Author', email: `${author}@example.test` },
    { id: reader, name: 'Reader', email: `${reader}@example.test` },
  ]);
  await db.insert(blogPosts).values([
    { id: post, authorId: author, slug: `${t}-pub`, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000) },
    { id: draft, authorId: author, slug: `${t}-draft`, status: 'DRAFT' },
  ]);
  await db.insert(blogComments).values([
    { id: root, postId: post, authorId: reader, content: 'racine', status: 'APPROVED' },
    { postId: post, authorId: author, parentId: root, content: 'réponse', status: 'APPROVED' },
    { postId: post, authorId: reader, content: 'en attente', status: 'PENDING' },
    { postId: draft, authorId: reader, content: 'brouillon', status: 'APPROVED' },
  ]);
  await db.insert(blogPostReviews).values([
    { id: review, postId: post, authorId: reader, rating: 4, status: 'APPROVED', content: 'bien' },
    { postId: post, authorId: author, rating: 5, status: 'APPROVED', content: 'très bien' },
  ] as never);
  await db.insert(blogPostReviewHelpful).values({ reviewId: review, userId: author, isHelpful: true } as never);
});

afterAll(async () => {
  const db = getDrizzle();
  await db.delete(blogPosts).where(inArray(blogPosts.id, [post, draft]));
  await db.delete(user).where(inArray(user.id, [author, reader]));
});

describe('blog.loader Effect-natif', () => {
  it('commentaires : racines approuvées avec réponses ; Effect et Promise identiques ; brouillon invisible', async () => {
    const viaEffect = await Effect.runPromise(blog.blogLoaderEffects.getBlogComments(post));
    expect(viaEffect).toHaveLength(1);
    expect(viaEffect[0].content).toBe('racine');
    expect(viaEffect[0].replies.map((r) => r.content)).toEqual(['réponse']);
    expect(await blog.getBlogComments(post)).toEqual(viaEffect);
    expect(await blog.getBlogComments(post, { status: 'ALL' })).toHaveLength(2);
    expect(await blog.getBlogComments(draft)).toEqual([]);
  });

  it('avis : vote du lecteur et statistiques', async () => {
    const reviews = await blog.getBlogReviews(post, { userId: author });
    expect(reviews.find((r) => r.id === review)?.userVote).toBe(true);
    expect((await blog.getBlogReviews(post)).every((r) => r.userVote === null)).toBe(true);
    expect(await blog.getBlogReviewStats(post)).toMatchObject({ total: 2, average: 4.5 });
  });

  it('statistiques, liens et galeries vides', async () => {
    expect(await blog.getBlogPostStats(post)).toEqual({ views: [], referrers: [], devices: [] });
    expect(await blog.getBlogPostLinks(post)).toEqual([]);
    expect((await blog.getBlogGalleriesWithMedia([])).size).toBe(0);
    expect((await blog.getBlogGalleriesWithMedia([crypto.randomUUID()])).size).toBe(0);
  });

  it('admin : article complet, liste paginée, file de modération, notifications', async () => {
    const admin = await blog.getBlogPostForAdmin(post);
    expect(admin?.post.id).toBe(post);
    expect(admin).toMatchObject({ translations: [], seo: null, galleries: [], links: [], categoryIds: [], tagIds: [], lock: null });
    expect(await blog.getBlogPostForAdmin(crypto.randomUUID())).toBeNull();
    expect(await Effect.runPromise(blog.blogLoaderEffects.getBlogPostForAdmin(post))).toEqual(admin);

    const list = await blog.getBlogPostsForAdmin(null, undefined, { limit: 100, status: 'DRAFT' });
    expect(list.rows.some((r) => r.post.id === draft)).toBe(true);
    expect(list.meta.total).toBeGreaterThanOrEqual(1);
    expect(list.rows.every((r) => Array.isArray(r.categories))).toBe(true);

    const queue = await blog.getBlogModerationQueue(null, { limit: 100 });
    expect(queue.comments.some((c) => c.comment.content === 'en attente')).toBe(true);

    expect(await blog.getBlogNotifications(reader)).toEqual([]);
    expect(await blog.getUnreadBlogNotificationCount(reader)).toBe(0);
  });

  it('taxonomie et cibles de liens : comptes publiés, slug traduit ou de repli, locale invalide', async () => {
    const db = getDrizzle();
    const cat = crypto.randomUUID();
    const tag = crypto.randomUUID();
    await db.insert(blogCategories).values({ id: cat, slug: `${t}-cat` } as never);
    await db.insert(blogTags).values({ id: tag, slug: `${t}-tag` } as never);
    await db.insert(blogPostTranslations).values([
      { postId: post, locale: 'fr', title: 'Publié', slug: `${t}-fr`, content: 'x' },
      { postId: draft, locale: 'fr', title: 'Brouillon', slug: `${t}-draft-fr`, content: 'x' },
    ] as never);
    await db.insert(blogPostCategories).values([{ postId: post, categoryId: cat }, { postId: draft, categoryId: cat }]);
    await db.insert(blogPostTags).values([{ postId: post, tagId: tag }, { postId: draft, tagId: tag }]);
    try {
      const fx = blog.blogTaxonomyEffects;
      const cats = await Effect.runPromise(fx.getBlogCategories(null, 'fr'));
      expect(cats.find((c) => c.id === cat)).toMatchObject({ slug: `${t}-cat`, translation: null, postCount: 1 });
      const tags = await Effect.runPromise(fx.getBlogTags(null, 'fr'));
      expect(tags.find((x) => x.id === tag)).toMatchObject({ slug: `${t}-tag`, translation: null, postCount: 1 });
      expect((await Effect.runPromise(fx.getBlogCategoryBySlug(null, 'fr', `${t}-cat`)))?.category.id).toBe(cat);
      expect((await Effect.runPromise(fx.getBlogTagBySlug(null, 'fr', `${t}-tag`)))?.tag.id).toBe(tag);
      expect(await Effect.runPromise(fx.getBlogTagBySlug(null, 'fr', `${t}-absent`))).toBeNull();

      const slugs = await Effect.runPromise(fx.getBlogPostSlugs(null, 'fr'));
      expect(slugs.has(`${t}-fr`)).toBe(true);
      expect(slugs.has(`${t}-draft-fr`)).toBe(false);
      const targets = await Effect.runPromise(fx.getBlogValidLinkTargets(null, 'fr'));
      for (const s of [`${t}-fr`, `${t}-cat`, `${t}-tag`]) expect(targets.has(s)).toBe(true);

      // Adaptateurs Promise (mis en cache) : mêmes résultats.
      expect(await blog.getBlogCategoryBySlug(null, 'fr', `${t}-cat`)).toEqual(await Effect.runPromise(fx.getBlogCategoryBySlug(null, 'fr', `${t}-cat`)));

      const bad = 'xx' as never;
      expect(await Effect.runPromise(fx.getBlogCategories(null, bad))).toEqual([]);
      expect(await Effect.runPromise(fx.getBlogTagBySlug(null, bad, `${t}-tag`))).toBeNull();
      expect((await Effect.runPromise(fx.getBlogValidLinkTargets(null, bad))).size).toBe(0);
    } finally {
      await db.delete(blogPostTranslations).where(inArray(blogPostTranslations.postId, [post, draft]));
      await db.delete(blogCategories).where(inArray(blogCategories.id, [cat]));
      await db.delete(blogTags).where(inArray(blogTags.id, [tag]));
    }
  });
});

