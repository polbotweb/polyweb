/**
 * Forums (base réelle) : forum + catégories pré-remplis, administration (catégories, étiquettes,
 * permissions par portée), participation (sujets, réponses, votes dédupliqués, réactions,
 * réputation, badges idempotents, sondages), recherche plein texte, visibilité indiscernable
 * (forum d'organisation, fil privé, préférences de messagerie), outils de modération audités,
 * signalement → décision → sanction automatique (sans fuite), levée, notifications, limites.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
vi.mock('astro:actions', () => ({ ActionError: class extends Error { code: string; constructor(o: any) { super(o.message); this.code = o.code; } }, defineAction: (d: any) => d }));

import { Effect } from 'effect';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import {
  auditLog, badgeAwards, eventOutbox, forumCategories, forumPosts, forumSanctions, forumTopics, forums, forumUserStats, member, messagingPreferences,
  moderationReports, notifications, organization, sites, user,
} from '@database/schemas';
import { forumsActions } from '@/modules/forums/actions';
import { forumsCommunityActions } from '@/modules/forums/actions/community';
import { moderation } from '@/actions/moderation';
import { messaging } from '@/actions/messaging';
import { registerModerationTargets } from '@/modules/moderation';
import { registerModuleNotifications } from '@/modules/notifications';
import { handleNotificationEvent } from '@/core/notifications/subscriber';
import { ensureSiteForum } from '@/modules/forums/services/forum.service';
import { forumBySlug, topicAccess } from '@/modules/forums/services/access';
import { listTopics, topicDetail, forumsOverview } from '@/modules/forums/loaders';
import { DEFAULT_FORUM, DEFAULT_FORUM_CATEGORIES } from '@/modules/forums/domain/defaults';
import { FORUMS_BADGE_AWARDED_EVENT, FORUMS_MENTIONED_EVENT, FORUMS_POST_CREATED_EVENT, FORUMS_SANCTION_APPLIED_EVENT } from '@/modules/forums/domain/events';
import { resetRateLimiter } from '@/lib/rate-limit';

const call = (a: any) => a.handler as (i: any, c: any) => Promise<any>;
const A = forumsActions as any, C = forumsCommunityActions as any;
const tag = `fo${Date.now()}`;
const id = (n: number) => `${tag}-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ADMIN = id(1), OWNER = id(2), M1 = id(3), M2 = id(4), OUT = id(5), M3 = id(6);
const ORG = id(10), SITE = id(11), SITE2 = id(12);
const db = () => getDrizzle();
const users: Record<string, { role: string }> = { [ADMIN]: { role: 'admin' } };
const ctx = (uid: string | null) => ({
  locals: { user: uid ? { id: uid, role: users[uid]?.role ?? 'user', banned: false, email: `${uid}@t.test`, name: uid.slice(-2) } : null, site: { id: SITE }, session: null },
  request: new Request('http://localhost/'), clientAddress: '127.0.0.1', cookies: { get: () => undefined },
});
const err = async (p: Promise<unknown>) => p.then(() => null, (e: any) => ({ code: e.code, message: e.message }));
const viewer = (uid: string | null) => (uid ? { id: uid, role: users[uid]?.role ?? 'user', banned: false } : null);
const run = <T>(e: any) => Effect.runPromise(e) as Promise<T>;
const note = 'Motif de modération';

let forumId = '';
let categoryIds: string[] = [];

beforeAll(async () => {
  registerModerationTargets();
  registerModuleNotifications();
  await db().insert(user).values([
    { id: ADMIN, name: 'Admin', email: `${tag}a@t.test`, emailVerified: true, role: 'admin', username: `${tag}admin` },
    { id: OWNER, name: 'Owner', email: `${tag}o@t.test`, emailVerified: true, username: `${tag}owner` },
    { id: M1, name: 'Alice', email: `${tag}1@t.test`, emailVerified: true, username: `${tag}alice` },
    { id: M2, name: 'Bob', email: `${tag}2@t.test`, emailVerified: true, username: `${tag}bob` },
    { id: OUT, name: 'Out', email: `${tag}x@t.test`, emailVerified: true, username: `${tag}out` },
    { id: M3, name: 'Carol', email: `${tag}3@t.test`, emailVerified: true, username: `${tag}carol` },
  ] as any);
  await db().insert(organization).values({ id: ORG, name: 'Org', slug: `${tag}-org`, createdAt: new Date() } as any);
  await db().insert(member).values([
    { id: id(20), organizationId: ORG, userId: OWNER, role: 'owner', createdAt: new Date() },
    { id: id(21), organizationId: ORG, userId: M1, role: 'member', createdAt: new Date() },
    { id: id(22), organizationId: ORG, userId: M2, role: 'member', createdAt: new Date() },
    { id: id(23), organizationId: ORG, userId: M3, role: 'member', createdAt: new Date() },
  ] as any);
  await db().insert(sites).values([
    { id: SITE, slug: `${tag}-s`, name: 'Site', organizationId: ORG },
    { id: SITE2, slug: `${tag}-s2`, name: 'Site 2', organizationId: null },
  ] as any);
});
beforeEach(() => resetRateLimiter());
afterAll(async () => {
  await db().delete(sites).where(inArray(sites.id, [SITE, SITE2]));
  await db().delete(moderationReports).where(eq(moderationReports.module, 'forums'));
  await db().delete(badgeAwards).where(eq(badgeAwards.scopeId, SITE));
  await db().delete(notifications).where(like(notifications.userId, `${tag}%`));
  await db().delete(messagingPreferences).where(like(messagingPreferences.userId, `${tag}%`));
  await db().delete(eventOutbox).where(sql`${eventOutbox.payload}->>'siteId' in (${SITE}, ${SITE2})`);
  await db().delete(organization).where(eq(organization.id, ORG));
  await db().delete(user).where(like(user.id, `${tag}%`));
});

describe('forums — socle et administration', () => {
  it('forum par défaut + catégories pré-remplies, idempotent et audité', async () => {
    expect(await run(ensureSiteForum({ siteId: SITE, organizationId: ORG }))).toBe(true);
    expect(await run(ensureSiteForum({ siteId: SITE, organizationId: ORG }))).toBe(false);
    const [forum] = await db().select().from(forums).where(eq(forums.siteId, SITE));
    expect(forum).toMatchObject({ slug: DEFAULT_FORUM.slug, status: 'PUBLISHED', visibility: 'public', organizationId: ORG });
    forumId = forum.id;
    const cats = await db().select().from(forumCategories).where(eq(forumCategories.forumId, forumId)).orderBy(forumCategories.position);
    expect(cats.map((c) => c.slug)).toEqual(DEFAULT_FORUM_CATEGORIES.map((c) => c.slug));
    categoryIds = cats.map((c) => c.id);
    const audits = await db().select().from(auditLog).where(and(eq(auditLog.action, 'forums.forum.seed'), eq(auditLog.resourceId, forumId)));
    expect(audits).toHaveLength(1);
  });

  it('catégories : création 4 langues, ordre, suppression avec déplacement ; refus hors permission', async () => {
    const denied = await err(call(A.categoryCreate)({ siteId: SITE, forumId, slug: 'x', translations: { fr: { name: 'X' } } }, ctx(M1)));
    expect(denied?.code).toBe('FORBIDDEN');
    const created = await call(A.categoryCreate)({ siteId: SITE, forumId, slug: '', translations: { fr: { name: 'Événements' }, en: { name: 'Events' }, es: { name: 'Eventos' }, ar: { name: 'فعاليات' } } }, ctx(OWNER));
    expect(created.slug).toBe('evenements');
    expect(created.position).toBe(DEFAULT_FORUM_CATEGORIES.length);
    expect((await err(call(A.categoryCreate)({ siteId: SITE, forumId, slug: 'evenements', translations: { fr: { name: 'Bis' } } }, ctx(OWNER))))?.code).toBe('CONFLICT');
    await call(A.categoryMove)({ siteId: SITE, categoryId: created.id, direction: 'up' }, ctx(OWNER));
    const order = (await db().select().from(forumCategories).where(eq(forumCategories.forumId, forumId)).orderBy(forumCategories.position)).map((c) => c.slug);
    expect(order.slice(-2)).toEqual(['evenements', DEFAULT_FORUM_CATEGORIES.at(-1)!.slug]);
    await call(A.categoryUpdate)({ siteId: SITE, categoryId: created.id, translations: { fr: { name: 'Agenda' } } }, ctx(OWNER));
    // Autre site : introuvable.
    expect((await err(call(A.categoryUpdate)({ siteId: SITE2, categoryId: created.id, translations: { fr: { name: 'Z' } } }, ctx(ADMIN))))?.code).toBe('NOT_FOUND');
    const topic = await call(C.topicCreate)({ forumId, categoryId: created.id, title: 'Sujet à déplacer', body: 'Corps du sujet', tagIds: [], privateWith: null, poll: null }, ctx(M1));
    expect((await err(call(A.categoryDelete)({ siteId: SITE, categoryId: created.id, moveTo: null }, ctx(OWNER))))?.code).toBe('BAD_REQUEST');
    const removed = await call(A.categoryDelete)({ siteId: SITE, categoryId: created.id, moveTo: categoryIds[1] }, ctx(OWNER));
    expect(removed).toEqual({ deleted: true, movedTopics: 1 });
    const [moved] = await db().select({ categoryId: forumTopics.categoryId }).from(forumTopics).where(eq(forumTopics.id, topic.id));
    expect(moved.categoryId).toBe(categoryIds[1]);
    const actions = (await db().select({ action: auditLog.action }).from(auditLog).where(and(eq(auditLog.resource, 'forums.category'), eq(auditLog.resourceId, created.id)))).map((r) => r.action).sort();
    expect(actions).toEqual(['forums.category.create', 'forums.category.delete', 'forums.category.reorder', 'forums.category.update']);
  });

  it('étiquettes du site : création unique, suppression auditée', async () => {
    const t1 = await call(A.tagCreate)({ siteId: SITE, label: 'Astuce' }, ctx(OWNER));
    expect(t1.slug).toBe('astuce');
    expect((await err(call(A.tagCreate)({ siteId: SITE, label: 'astuce' }, ctx(OWNER))))?.code).toBe('CONFLICT');
    const t2 = await call(A.tagCreate)({ siteId: SITE, label: 'Temporaire' }, ctx(OWNER));
    expect(await call(A.tagDelete)({ siteId: SITE, tagId: t2.id }, ctx(OWNER))).toEqual({ deleted: true });
    expect((await err(call(A.tagDelete)({ siteId: SITE, tagId: t2.id }, ctx(OWNER))))?.code).toBe('NOT_FOUND');
  });
});

describe('forums — participation', () => {
  let topicId = '', postId = '', tagId = '';

  it('sujet avec étiquette et mention ; réponse ; outbox sans contenu', async () => {
    [{ id: tagId }] = await db().select({ id: sql<string>`id` }).from(sql`forum_tags`).where(sql`site_id = ${SITE} and slug = 'astuce'`) as any;
    const topic = await call(C.topicCreate)({ forumId, categoryId: categoryIds[2], title: 'Comment configurer le thème ?', body: `Question **secrète** pour @${tag}bob`, tagIds: [tagId], privateWith: null, poll: null }, ctx(M1));
    topicId = topic.id;
    const [row] = await db().select().from(forumTopics).where(eq(forumTopics.id, topicId));
    expect(row.bodyHtml).toContain('<strong>secrète</strong>');
    const mention = await db().select().from(eventOutbox).where(and(eq(eventOutbox.name, FORUMS_MENTIONED_EVENT), sql`${eventOutbox.payload}->>'topicId' = ${topicId}`));
    expect(mention).toHaveLength(1);
    expect((mention[0].payload as any).userIds).toEqual([M2]);
    const reply = await call(C.reply)({ topicId, body: 'Réponse utile avec le mot magique flamboyant' }, ctx(M2));
    postId = reply.id;
    const events = await db().select().from(eventOutbox).where(and(eq(eventOutbox.name, FORUMS_POST_CREATED_EVENT), sql`${eventOutbox.payload}->>'postId' = ${postId}`));
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0].payload)).not.toMatch(/flamboyant|secrète/);
    const [after] = await db().select({ replyCount: forumTopics.replyCount }).from(forumTopics).where(eq(forumTopics.id, topicId));
    expect(after.replyCount).toBe(1);
  });

  it('notification de réponse aux abonnés (pas à l’auteur), mention', async () => {
    const toEvent = (e: any) => ({ id: e.id, name: e.name, occurredAt: new Date(e.occurredAt).toISOString(), siteId: null, organizationId: e.organizationId ?? null, payload: e.payload });
    const [created] = await db().select().from(eventOutbox).where(and(eq(eventOutbox.name, FORUMS_POST_CREATED_EVENT), sql`${eventOutbox.payload}->>'postId' = ${postId}`));
    await run(handleNotificationEvent(toEvent(created) as any));
    const [mention] = await db().select().from(eventOutbox).where(and(eq(eventOutbox.name, FORUMS_MENTIONED_EVENT), sql`${eventOutbox.payload}->>'topicId' = ${topicId}`));
    await run(handleNotificationEvent(toEvent(mention) as any));
    const rows = (await db().select({ userId: notifications.userId, module: notifications.module, type: notifications.type }).from(notifications).where(inArray(notifications.userId, [M1, M2]))).map((r) => ({ userId: r.userId, type: `${r.module}:${r.type}` }));
    expect(rows).toEqual(expect.arrayContaining([{ userId: M1, type: 'forums:TOPIC_REPLY' }, { userId: M2, type: 'forums:MENTION' }]));
    expect(rows.some((r) => r.userId === M2 && r.type === 'forums:TOPIC_REPLY')).toBe(false);
  });

  it('votes dédupliqués, pas d’auto-vote, réputation et badges idempotents', async () => {
    expect((await err(call(C.vote)({ targetType: 'post', targetId: postId, value: 1 }, ctx(M2))))?.code).toBe('FORBIDDEN');
    await call(C.vote)({ targetType: 'post', targetId: postId, value: 1 }, ctx(M1));
    const again = await call(C.vote)({ targetType: 'post', targetId: postId, value: 1 }, ctx(M1));
    expect(again.score).toBe(1);
    expect((await call(C.vote)({ targetType: 'post', targetId: postId, value: 1 }, ctx(M3))).score).toBe(2);
    expect((await call(C.vote)({ targetType: 'post', targetId: postId, value: -1 }, ctx(M3))).score).toBe(0);
    await call(C.vote)({ targetType: 'post', targetId: postId, value: 0 }, ctx(M3));
    await call(C.accept)({ topicId, postId }, ctx(M1));
    expect((await err(call(C.accept)({ topicId, postId }, ctx(M3))))?.code).toBe('FORBIDDEN');
    const [stats] = await db().select().from(forumUserStats).where(and(eq(forumUserStats.siteId, SITE), eq(forumUserStats.userId, M2)));
    expect(stats).toMatchObject({ reputation: 25, acceptedAnswers: 1, upvotesReceived: 1, posts: 1 });
    const badges = async () => (await db().select({ badge: badgeAwards.badge }).from(badgeAwards).where(and(eq(badgeAwards.scopeId, SITE), eq(badgeAwards.userId, M2)))).map((b) => b.badge).sort();
    expect(await badges()).toEqual(['first_reply', 'helpful']);
    await call(C.accept)({ topicId, postId: null }, ctx(M1));
    await call(C.accept)({ topicId, postId }, ctx(M1));
    expect(await badges()).toEqual(['first_reply', 'helpful']);
    const awarded = await db().select().from(eventOutbox).where(and(eq(eventOutbox.name, FORUMS_BADGE_AWARDED_EVENT), sql`${eventOutbox.payload}->>'userId' = ${M2}`));
    expect(awarded.map((e: any) => e.payload.badge).sort()).toEqual(['first_reply', 'helpful']);
  });

  it('réactions basculées, une par type et par personne', async () => {
    expect(await call(C.react)({ targetType: 'topic', targetId: topicId, reaction: 'thanks' }, ctx(M2))).toEqual({ active: true });
    expect(await call(C.react)({ targetType: 'topic', targetId: topicId, reaction: 'thanks' }, ctx(M2))).toEqual({ active: false });
    await call(C.react)({ targetType: 'topic', targetId: topicId, reaction: 'like' }, ctx(M2));
    const access = await run<any>(topicAccess(topicId, viewer(M2)));
    const detail = await run<any>(topicDetail({ access, viewer: viewer(M2), page: 1, locale: 'fr' }));
    expect(detail.topic.reactions).toEqual([{ reaction: 'like', count: 1, mine: true }]);
    expect(detail.posts[0].accepted).toBe(true);
    expect(detail.authors[M2].badges.sort()).toEqual(['first_reply', 'helpful']);
  });

  it('votes concurrents : score et réputation exacts (pas de mise à jour perdue)', async () => {
    const reply = await call(C.reply)({ topicId, body: 'Réponse soumise aux votes simultanés' }, ctx(M1));
    const statsOf = async () => (await db().select().from(forumUserStats).where(and(eq(forumUserStats.siteId, SITE), eq(forumUserStats.userId, M1))))[0];
    const before = await statsOf();
    await Promise.all([M2, M3, OWNER, OUT, ADMIN].map((u) => call(C.vote)({ targetType: 'post', targetId: reply.id, value: 1 }, ctx(u))));
    const [post] = await db().select({ score: forumPosts.score }).from(forumPosts).where(eq(forumPosts.id, reply.id));
    expect(post.score).toBe(5);
    const after = await statsOf();
    expect(after.upvotesReceived - before.upvotesReceived).toBe(5);
    expect(after.reputation - before.reputation).toBe(50);
    // Votes inversés en rafale : toujours exact.
    await Promise.all([M2, M3].map((u) => call(C.vote)({ targetType: 'post', targetId: reply.id, value: -1 }, ctx(u))));
    expect((await db().select({ score: forumPosts.score }).from(forumPosts).where(eq(forumPosts.id, reply.id)))[0].score).toBe(1);
    expect((await statsOf()).upvotesReceived - before.upvotesReceived).toBe(3);
  });

  it('recherche plein texte (sujet et réponses), filtres catégorie et étiquette, pagination', async () => {
    const access = await run<any>(forumBySlug(SITE, DEFAULT_FORUM.slug, null));
    const byReply = await run<any>(listTopics({ access, viewer: null, q: 'flamboyant', page: 1 }));
    expect(byReply.items.map((t: any) => t.id)).toEqual([topicId]);
    const byTitle = await run<any>(listTopics({ access, viewer: null, q: 'configurer thème', page: 1 }));
    expect(byTitle.items.map((t: any) => t.id)).toContain(topicId);
    expect((await run<any>(listTopics({ access, viewer: null, q: 'introuvablezzz', page: 1 }))).total).toBe(0);
    expect((await run<any>(listTopics({ access, viewer: null, tagSlug: 'astuce', page: 1 }))).items.map((t: any) => t.id)).toEqual([topicId]);
    expect((await run<any>(listTopics({ access, viewer: null, categoryId: categoryIds[0], page: 1 }))).total).toBe(0);
    const page2 = await run<any>(listTopics({ access, viewer: null, page: 2 }));
    expect(page2.items).toEqual([]);
  });

  it('sondage : un vote par personne, choix simple, résultats après vote', async () => {
    const topic = await call(C.topicCreate)({ forumId, categoryId: categoryIds[3], title: 'Quel jour pour la réunion ?', body: 'Votez', tagIds: [], privateWith: null, poll: { question: 'Jour ?', options: ['Lundi', 'Mardi', 'Lundi'], multiple: false, resultsVisibility: 'after_vote', closesAt: null } }, ctx(M1));
    const access = await run<any>(topicAccess(topic.id, viewer(M2)));
    const before = await run<any>(topicDetail({ access, viewer: viewer(M2), page: 1, locale: 'fr' }));
    expect(before.poll.options.map((o: any) => o.label)).toEqual(['Lundi', 'Mardi']);
    expect(before.poll.options.every((o: any) => o.votes === null)).toBe(true);
    const [o1, o2] = before.poll.options.map((o: any) => o.id);
    expect((await err(call(C.pollVote)({ pollId: before.poll.id, optionIds: [o1, o2] }, ctx(M2))))?.code).toBe('BAD_REQUEST');
    await call(C.pollVote)({ pollId: before.poll.id, optionIds: [o2] }, ctx(M2));
    expect((await err(call(C.pollVote)({ pollId: before.poll.id, optionIds: [o1] }, ctx(M2))))?.code).toBe('CONFLICT');
    const after = await run<any>(topicDetail({ access, viewer: viewer(M2), page: 1, locale: 'fr' }));
    expect(after.poll).toMatchObject({ voted: true, showResults: true, totalBallots: 1 });
    expect(after.poll.options.map((o: any) => o.votes)).toEqual([0, 1]);
    expect((await err(call(C.topicCreate)({ forumId, categoryId: categoryIds[3], title: 'Sondage invalide', body: 'x y', tagIds: [], privateWith: null, poll: { question: 'Q ?', options: ['seule'], multiple: false, resultsVisibility: 'always', closesAt: null } }, ctx(M1))))?.code).toBe('BAD_REQUEST');
  });
});

describe('forums — visibilité indiscernable', () => {
  it('forum d’organisation : non-membre et forum absent → même NOT_FOUND', async () => {
    const orgForum = await call(A.create)({ siteId: SITE, title: 'Interne', slug: 'interne', visibility: 'org' }, ctx(OWNER));
    await call(A.transition)({ id: orgForum.id, to: 'PUBLISHED' }, ctx(OWNER));
    const missing = await err(run(forumBySlug(SITE, 'nexistepas', viewer(OUT))));
    expect(missing?.code).toBe('NOT_FOUND');
    expect(await err(run(forumBySlug(SITE, 'interne', viewer(OUT))))).toEqual(missing);
    expect(await err(run(forumBySlug(SITE, 'interne', null)))).toEqual(missing);
    expect(await run(forumBySlug(SITE, 'interne', viewer(M1)))).toBeTruthy();
    const overview = await run<any[]>(forumsOverview(SITE, viewer(OUT), 'fr'));
    expect(overview.map((f) => f.slug)).toEqual([DEFAULT_FORUM.slug]);
    const cat = (await db().select().from(forumCategories).where(eq(forumCategories.forumId, orgForum.id)))[0];
    expect((await err(call(C.topicCreate)({ forumId: orgForum.id, categoryId: cat.id, title: 'Tentative', body: 'Externe', tagIds: [], privateWith: null, poll: null }, ctx(OUT))))).toEqual(missing);
  });

  it('fil privé : participants seulement (modérateurs inclus), invitations soumises aux préférences', async () => {
    const t = await call(C.topicCreate)({ forumId, categoryId: categoryIds[1], title: 'Discussion privée', body: 'Entre nous', tagIds: [], privateWith: [`@${tag}bob`], poll: null }, ctx(M1));
    const missing = await err(run(topicAccess(id(999), viewer(OUT))));
    for (const who of [OUT, OWNER, ADMIN, M3]) expect(await err(run(topicAccess(t.id, viewer(who)))), who).toEqual(missing);
    expect(await err(run(topicAccess(t.id, null)))).toEqual(missing);
    expect((await run<any>(topicAccess(t.id, viewer(M2)))).participant).toBe(true);
    expect(await err(call(C.reply)({ topicId: t.id, body: 'intrus' }, ctx(OUT)))).toEqual(missing);
    expect(await err(call(C.vote)({ targetType: 'topic', targetId: t.id, value: 1 }, ctx(M3)))).toEqual(missing);
    const access = await run<any>(forumBySlug(SITE, DEFAULT_FORUM.slug, viewer(M3)));
    expect((await run<any>(listTopics({ access, viewer: viewer(M3), q: 'privée', page: 1 }))).total).toBe(0);
    expect((await run<any>(listTopics({ access, viewer: viewer(M2), q: 'privée', page: 1 }))).total).toBe(1);
    // Mention d'un non-participant dans un fil privé : événement filtré, aucune notification.
    await call(C.reply)({ topicId: t.id, body: `Faut-il prévenir @${tag}carol ?` }, ctx(M1));
    const [privMention] = await db().select().from(eventOutbox).where(and(eq(eventOutbox.name, FORUMS_MENTIONED_EVENT), sql`${eventOutbox.payload}->>'topicId' = ${t.id}`));
    expect((privMention.payload as any).userIds).toEqual([M3]);
    await run(handleNotificationEvent({ id: privMention.id, name: privMention.name, occurredAt: new Date(privMention.occurredAt).toISOString(), siteId: null, organizationId: privMention.organizationId ?? null, payload: privMention.payload } as any));
    expect(await db().select().from(notifications).where(and(eq(notifications.userId, M3), eq(notifications.resourceId, t.id)))).toEqual([]);
    // Préférence « personne » de la messagerie : invitation refusée comme un pseudo inconnu.
    await call(messaging.preferenceSet)({ whoCanMessage: 'nobody' }, ctx(M3));
    const unknown = await err(call(C.invite)({ topicId: t.id, username: `${tag}nobody` }, ctx(M1)));
    expect(await err(call(C.invite)({ topicId: t.id, username: `${tag}carol` }, ctx(M1)))).toEqual(unknown);
    await call(messaging.preferenceSet)({ whoCanMessage: 'everyone' }, ctx(M3));
    await call(messaging.block)({ userId: M1, blocked: true }, ctx(M3));
    expect(await err(call(C.invite)({ topicId: t.id, username: `${tag}carol` }, ctx(M1)))).toEqual(unknown);
    await call(messaging.block)({ userId: M1, blocked: false }, ctx(M3));
    expect(await call(C.invite)({ topicId: t.id, username: `${tag}carol` }, ctx(M1))).toEqual({ invited: true });
    expect((await run<any>(topicAccess(t.id, viewer(M3)))).participant).toBe(true);
    expect(await call(C.leave)({ topicId: t.id }, ctx(M3))).toEqual({ left: true });
    expect(await err(run(topicAccess(t.id, viewer(M3))))).toEqual(missing);
    // Signalement d'un fil privé par un non-participant : indiscernable.
    expect((await err(call(moderation.report)({ target: 'forums.topic', id: t.id, reason: 'spam' }, ctx(OUT))))?.code).toBe('NOT_FOUND');
  });
});

describe('forums — modération, sanctions automatiques et limites', () => {
  it('outils de sujet : motif obligatoire, verrouillage audité, réponse refusée', async () => {
    const t = await call(C.topicCreate)({ forumId, categoryId: categoryIds[1], title: 'Sujet à verrouiller', body: 'Contenu', tagIds: [], privateWith: null, poll: null }, ctx(M1));
    expect((await err(call(C.moderateTopic)({ topicId: t.id, tool: 'lock', note: '' }, ctx(OWNER))))?.code).toBe('BAD_REQUEST');
    expect((await err(call(C.moderateTopic)({ topicId: t.id, tool: 'lock', note }, ctx(M2))))?.code).toBe('NOT_FOUND');
    await call(C.moderateTopic)({ topicId: t.id, tool: 'lock', note }, ctx(OWNER));
    await call(C.moderateTopic)({ topicId: t.id, tool: 'pin', note }, ctx(OWNER));
    await call(C.moderateTopic)({ topicId: t.id, tool: 'move', note, categoryId: categoryIds[0] }, ctx(OWNER));
    expect((await err(call(C.reply)({ topicId: t.id, body: 'Encore ?' }, ctx(M2))))?.code).toBe('FORBIDDEN');
    const audits = await db().select({ action: auditLog.action, metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.resource, 'forums.topic'), eq(auditLog.resourceId, t.id)));
    expect(audits.map((a) => a.action).sort()).toEqual(['forums.topic.lock', 'forums.topic.move', 'forums.topic.pin']);
    expect(audits.every((a) => (a.metadata as any).note === note)).toBe(true);
    const access = await run<any>(forumBySlug(SITE, DEFAULT_FORUM.slug, null));
    expect((await run<any>(listTopics({ access, viewer: null, page: 1 }))).items[0].id).toBe(t.id);
  });

  it('signalements retenus → sourdine puis suspension, sans fuite ; levée motivée', async () => {
    await call(A.sanctionPolicySet)({ siteId: SITE, enabled: true, windowDays: 30, muteThreshold: 1, muteHours: 24, suspendThreshold: 2, suspendDays: 7 }, ctx(OWNER));
    expect((await err(call(A.sanctionPolicySet)({ siteId: SITE, enabled: true, windowDays: 30, muteThreshold: 3, muteHours: 24, suspendThreshold: 2, suspendDays: 7 }, ctx(OWNER))))?.code).toBe('BAD_REQUEST');
    const bad = await call(C.topicCreate)({ forumId, categoryId: categoryIds[1], title: 'Contenu douteux', body: 'Achetez maintenant', tagIds: [], privateWith: null, poll: null }, ctx(M3));
    const reply = await call(C.reply)({ topicId: bad.id, body: 'Encore de la pub' }, ctx(M3));
    expect(await call(moderation.report)({ target: 'forums.topic', id: bad.id, reason: 'spam', description: 'TEXTE-DU-SIGNALEMENT' }, ctx(M1))).toEqual({ accepted: true });
    await call(moderation.decide)({ target: 'forums.topic', id: bad.id, decision: 'spam', note }, ctx(OWNER));
    let active = await db().select().from(forumSanctions).where(and(eq(forumSanctions.siteId, SITE), eq(forumSanctions.userId, M3)));
    expect(active.map((s) => s.kind)).toEqual(['mute']);
    expect(active[0]).toMatchObject({ automatic: true, triggerCount: 1 });
    // Sourdine : publication refusée, vote toujours possible.
    expect((await err(call(C.reply)({ topicId: (await firstVisibleTopic()).id, body: 'muet ?' }, ctx(M3))))?.code).toBe('FORBIDDEN');
    expect((await call(C.vote)({ targetType: 'post', targetId: postIdOf(await firstPost(forumId)), value: 1 }, ctx(M3))).score).toBeGreaterThanOrEqual(0);
    // Second contenu retenu dans la fenêtre (seuil de suspension) → suspension ; tout est bloqué.
    await call(moderation.decide)({ target: 'forums.post', id: reply.id, decision: 'hide', note }, ctx(OWNER));
    active = await db().select().from(forumSanctions).where(and(eq(forumSanctions.siteId, SITE), eq(forumSanctions.userId, M3)));
    expect(active.map((s) => s.kind).sort()).toEqual(['mute', 'suspension']);
    expect((await err(call(C.react)({ targetType: 'topic', targetId: (await firstVisibleTopic()).id, reaction: 'like' }, ctx(M3))))?.code).toBe('FORBIDDEN');
    expect((await err(call(C.follow)({ topicId: (await firstVisibleTopic()).id, follow: true }, ctx(M3))))?.code).toBe('FORBIDDEN');
    const events = await db().select().from(eventOutbox).where(and(eq(eventOutbox.name, FORUMS_SANCTION_APPLIED_EVENT), sql`${eventOutbox.payload}->>'userId' = ${M3}`));
    expect(events).toHaveLength(2);
    const serialized = JSON.stringify(events.map((e) => e.payload));
    expect(serialized).not.toContain('TEXTE-DU-SIGNALEMENT');
    expect(serialized).not.toContain(M1);
    const audits = await db().select().from(auditLog).where(and(eq(auditLog.action, 'forums.sanction.apply'), sql`${auditLog.metadata}->>'userId' = ${M3}`));
    expect(audits).toHaveLength(2);
    expect(audits.every((a) => a.userId === null)).toBe(true);
    expect(JSON.stringify(audits.map((a) => a.metadata))).not.toContain(M1);
    // Levée motivée par un modérateur ; refusée à un membre.
    const suspension = active.find((s) => s.kind === 'suspension')!;
    expect((await err(call(A.sanctionRevoke)({ siteId: SITE, sanctionId: suspension.id, note }, ctx(M1))))?.code).toBe('FORBIDDEN');
    expect(await call(A.sanctionRevoke)({ siteId: SITE, sanctionId: suspension.id, note }, ctx(OWNER))).toEqual({ revoked: true });
    expect((await err(call(A.sanctionRevoke)({ siteId: SITE, sanctionId: suspension.id, note }, ctx(OWNER))))?.code).toBe('NOT_FOUND');
    // Sourdine toujours active après la levée de la suspension ; puis échue → publication rétablie.
    expect((await err(call(C.reply)({ topicId: (await firstVisibleTopic()).id, body: 'Toujours muet ?' }, ctx(M3))))?.code).toBe('FORBIDDEN');
    expect(await call(C.follow)({ topicId: (await firstVisibleTopic()).id, follow: true }, ctx(M3))).toEqual({ following: true });
    const mute = active.find((s) => s.kind === 'mute')!;
    await db().update(forumSanctions).set({ startsAt: new Date(Date.now() - 2 * 86_400_000), endsAt: new Date(Date.now() - 1000) }).where(eq(forumSanctions.id, mute.id));
    expect((await call(C.reply)({ topicId: (await firstVisibleTopic()).id, body: 'De retour, poliment.' }, ctx(M3))).id).toBeTruthy();
    const revokes = await db().select().from(auditLog).where(and(eq(auditLog.action, 'forums.sanction.revoke'), eq(auditLog.resourceId, suspension.id)));
    expect(revokes).toHaveLength(1);
    expect(revokes[0].userId).toBe(OWNER);
  });

  it('limite de débit : 5 sujets / 10 min', async () => {
    resetRateLimiter();
    for (let i = 0; i < 5; i++) await call(C.topicCreate)({ forumId, categoryId: categoryIds[1], title: `Rafale ${i}`, body: 'Corps', tagIds: [], privateWith: null, poll: null }, ctx(M2));
    expect((await err(call(C.topicCreate)({ forumId, categoryId: categoryIds[1], title: 'Rafale 6', body: 'Corps', tagIds: [], privateWith: null, poll: null }, ctx(M2))))?.code).toBe('TOO_MANY_REQUESTS');
  });
});

async function firstPost(fid: string) {
  const [row] = await db().select({ id: forumPosts.id }).from(forumPosts).innerJoin(forumTopics, eq(forumTopics.id, forumPosts.topicId)).where(and(eq(forumTopics.forumId, fid), eq(forumPosts.status, 'visible'), eq(forumTopics.isPrivate, false), sql`${forumPosts.authorId} <> ${M3}`, eq(forumTopics.status, 'visible'))).limit(1);
  return row;
}
const postIdOf = (row: { id: string }) => row.id;
async function firstVisibleTopic() {
  const [row] = await db().select({ id: forumTopics.id }).from(forumTopics).where(and(eq(forumTopics.forumId, forumId), eq(forumTopics.status, 'visible'), eq(forumTopics.locked, false), eq(forumTopics.isPrivate, false))).limit(1);
  return row;
}
