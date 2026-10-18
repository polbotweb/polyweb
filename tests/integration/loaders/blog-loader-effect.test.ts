/**
 * blog.loader — lectures Effect-natives (dbTry) et adaptateurs Promise : mêmes résultats,
 * contre un vrai Postgres (commentaires imbriqués, avis + vote du lecteur, statistiques,
 * liens, galeries) ; un brouillon reste invisible.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { blogComments, blogPostReviewHelpful, blogPostReviews, blogPosts, user } from '@database/schemas';
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
});
