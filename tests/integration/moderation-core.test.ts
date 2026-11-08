/**
 * Socle de modération générique (base réelle) : signalement dédupliqué (connecté, anonyme par IP
 * hachée, concurrence), cibles invisibles/étrangères/absentes indiscernables, autorisation par
 * organisation, décisions motivées atomiques (action + audit + outbox dans la même transaction),
 * confidentialité de l'audit et de l'outbox, notifications et préférences, recalcul de la note.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  }
  return { ActionError, defineAction: (def: any) => def };
});

import { Effect } from 'effect';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import {
  auditLog, blogComments, blogPostReviews, blogPosts, eventOutbox, member, moderationActions, moderationReports,
  notifications, organization, serviceReviews, services, user,
} from '@database/schemas';
import { moderation } from '@/actions/moderation';
import { registerModerationTargets } from '@/modules/moderation';
import { decideModeration, listModerationQueue, MODERATION_DECIDED_EVENT } from '@/core/moderation/service';
import { registerModuleModeration, defineModuleModeration } from '@/core/moderation/registry';
import { handleNotificationEvent } from '@/core/notifications/subscriber';
import { registerNotificationDefinitions } from '@/core/notifications/registry';
import { setNotificationPreference } from '@/core/notifications/service';
import { moderationNotifications } from '@/core/moderation/notifications';
import { resetRateLimiter } from '@/lib/rate-limit';
import { dbTry } from '@/lib/effect/run';

const call = (action: any) => action.handler as (i: any, c: any) => Promise<any>;
const report = call(moderation.report);
const decide = call(moderation.decide);
const resolve = call(moderation.resolve);

const tag = `mc${Date.now()}`;
const id = (n: number) => `${tag}-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ADMIN = id(1), OWNER1 = id(2), OWNER2 = id(3), MEMBER1 = id(4), AUTHOR = id(5), REP1 = id(6), REP2 = id(7), AUTHOR2 = id(8);
const ORG1 = id(10), ORG2 = id(11);
const POST = id(20), DRAFT = id(21), COMMENT = id(22), DRAFT_COMMENT = id(23), REVIEW = id(24), RACE = id(25), PROBE = id(26);
const SERVICE = id(30), SREVIEW1 = id(31), SREVIEW2 = id(32);
const CONTENT = 'Contenu <b>secret</b> du commentaire';

const db = () => getDrizzle();
const ctx = (u: { id: string; role?: string } | null, ip = '203.0.113.7') => ({
  locals: { user: u ? { id: u.id, role: u.role ?? 'user', banned: false, email: `${u.id}@example.test`, name: 'T' } : null, site: null },
  request: new Request('http://localhost/', { headers: { 'x-forwarded-for': ip } }),
  clientAddress: ip,
  cookies: { get: () => undefined },
});
const errorOf = async (p: Promise<unknown>) => p.then(() => null, (e: any) => ({ code: e.code, message: e.message }));
const reportsFor = (targetId: string) => db().select().from(moderationReports).where(eq(moderationReports.targetId, targetId));
const note = 'Décision motivée';

beforeAll(async () => {
  registerModerationTargets();
  registerNotificationDefinitions(moderationNotifications);
  const users = [ADMIN, OWNER1, OWNER2, MEMBER1, AUTHOR, REP1, REP2, AUTHOR2];
  await db().insert(user).values(users.map((u) => ({ id: u, name: `U ${u.slice(-2)}`, email: `${u}@example.test`, emailVerified: true, role: u === ADMIN ? 'admin' : 'user' })) as any);
  await db().insert(organization).values([{ id: ORG1, name: 'Org 1', slug: `${tag}-o1`, createdAt: new Date() }, { id: ORG2, name: 'Org 2', slug: `${tag}-o2`, createdAt: new Date() }] as any);
  await db().insert(member).values([
    { id: id(40), organizationId: ORG1, userId: OWNER1, role: 'owner', createdAt: new Date() },
    { id: id(41), organizationId: ORG2, userId: OWNER2, role: 'owner', createdAt: new Date() },
    { id: id(42), organizationId: ORG1, userId: MEMBER1, role: 'member', createdAt: new Date() },
  ] as any);
  const past = new Date(Date.now() - 86_400_000);
  await db().insert(blogPosts).values([
    { id: POST, authorId: OWNER1, slug: `${tag}-p`, organizationId: ORG1, status: 'PUBLISHED', publishedAt: past },
    { id: DRAFT, authorId: OWNER1, slug: `${tag}-d`, organizationId: ORG1, status: 'DRAFT' },
  ] as any);
  await db().insert(blogComments).values([
    { id: COMMENT, postId: POST, authorId: AUTHOR, content: CONTENT, status: 'APPROVED' },
    { id: DRAFT_COMMENT, postId: DRAFT, authorId: AUTHOR, content: 'invisible', status: 'APPROVED' },
    { id: RACE, postId: POST, authorId: AUTHOR, content: 'course', status: 'APPROVED' },
    { id: PROBE, postId: POST, authorId: AUTHOR, content: 'sonde', status: 'APPROVED' },
  ] as any);
  await db().insert(blogPostReviews).values([{ id: REVIEW, postId: POST, authorId: AUTHOR, content: 'avis', rating: 4, status: 'APPROVED' }] as any);
  await db().insert(services).values([{ id: SERVICE, providerId: OWNER1, slug: `${tag}-s`, organizationId: ORG1, status: 'PUBLISHED', publishedAt: past, ratingAverage100: 300, ratingCount: 2 }] as any);
  await db().insert(serviceReviews).values([
    { id: SREVIEW1, serviceId: SERVICE, authorId: AUTHOR, rating: 5, content: 'top', status: 'APPROVED' },
    { id: SREVIEW2, serviceId: SERVICE, authorId: AUTHOR2, rating: 1, content: 'bof', status: 'APPROVED' },
  ] as any);
});

beforeEach(() => resetRateLimiter());

afterAll(async () => {
  const targets = [POST, DRAFT, COMMENT, DRAFT_COMMENT, REVIEW, RACE, PROBE, SERVICE, SREVIEW1, SREVIEW2];
  await db().delete(moderationReports).where(inArray(moderationReports.targetId, targets));
  await db().delete(moderationActions).where(inArray(moderationActions.targetId, targets));
  await db().delete(eventOutbox).where(sql`${eventOutbox.payload}->>'targetId' like ${`${tag}%`}`);
  await db().delete(services).where(eq(services.id, SERVICE));
  await db().delete(blogPosts).where(inArray(blogPosts.id, [POST, DRAFT]));
  await db().delete(organization).where(inArray(organization.id, [ORG1, ORG2]));
  await db().delete(user).where(like(user.id, `${tag}%`));
});

describe('moderation — signalement', () => {
  it('déduplique les signalements anonymes par IP hachée, sans IP ni identifiant en clair', async () => {
    expect(await report({ target: 'blog.comment', id: COMMENT, reason: 'spam' }, ctx(null, '198.51.100.1'))).toEqual({ accepted: true });
    expect(await report({ target: 'blog.comment', id: COMMENT, reason: 'abusive' }, ctx(null, '198.51.100.1'))).toEqual({ accepted: true });
    await report({ target: 'blog.comment', id: COMMENT, reason: 'spam' }, ctx(null, '198.51.100.2'));
    const rows = await reportsFor(COMMENT);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.reporterId).toBeNull();
      expect(r.reporterKey).toMatch(/^h:[A-Za-z0-9_-]+$/);
      expect(r.reporterKey).not.toContain('198.51');
      expect(r.organizationId).toBe(ORG1);
    }
  });

  it('déduplique les signalements connectés, y compris en concurrence, et nettoie la description', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => report({ target: 'blog.review', id: REVIEW, reason: 'other', description: '<script>x</script>Motif' }, ctx({ id: REP1 }))));
    expect(results.every((r) => r.accepted)).toBe(true);
    await report({ target: 'blog.review', id: REVIEW, reason: 'spam' }, ctx({ id: REP2 }));
    const rows = await reportsFor(REVIEW);
    expect(rows).toHaveLength(2);
    const mine = rows.find((r) => r.reporterId === REP1)!;
    expect(mine.description).not.toContain('<script>');
    expect(mine.reporterKey).not.toContain(REP1);
  });

  it('rend indiscernables cibles invisibles, absentes et types inconnus', async () => {
    const invisible = await errorOf(report({ target: 'blog.comment', id: DRAFT_COMMENT, reason: 'spam' }, ctx({ id: REP1 })));
    const missing = await errorOf(report({ target: 'blog.comment', id: id(999), reason: 'spam' }, ctx({ id: REP1 })));
    const unknown = await errorOf(report({ target: 'blog.unknown', id: COMMENT, reason: 'spam' }, ctx({ id: REP1 })));
    expect(invisible).toEqual(missing);
    expect(unknown).toEqual(missing);
    expect(missing?.code).toBe('NOT_FOUND');
    expect(await reportsFor(DRAFT_COMMENT)).toHaveLength(0);
  });

  it('exige une connexion pour signaler un service', async () => {
    expect((await errorOf(report({ target: 'services.service', id: SERVICE, reason: 'spam' }, ctx(null))))?.code).toBe('UNAUTHORIZED');
    expect(await report({ target: 'services.service', id: SERVICE, reason: 'spam' }, ctx({ id: REP1 }))).toEqual({ accepted: true });
  });
});

describe('moderation — autorisation et confidentialité', () => {
  it('refuse une organisation étrangère et un membre sans droit comme une cible absente', async () => {
    const missing = await errorOf(decide({ target: 'blog.comment', id: id(998), decision: 'hide', note }, ctx({ id: OWNER1 })));
    const foreign = await errorOf(decide({ target: 'blog.comment', id: COMMENT, decision: 'hide', note }, ctx({ id: OWNER2 })));
    const member1 = await errorOf(decide({ target: 'blog.comment', id: COMMENT, decision: 'hide', note }, ctx({ id: MEMBER1 })));
    expect(foreign).toEqual(missing);
    expect(member1).toEqual(missing);
    expect(missing?.code).toBe('NOT_FOUND');
    const [row] = await db().select({ status: blogComments.status }).from(blogComments).where(eq(blogComments.id, COMMENT));
    expect(row.status).toBe('APPROVED');
  });

  it('isole la file par organisation et ne révèle jamais le signaleur', async () => {
    const keys = ['blog.comment', 'blog.review', 'services.service'];
    const own = await Effect.runPromise(listModerationQueue({ organizationId: ORG1, keys, status: 'open', page: 1, pageSize: 50, locale: 'fr' }));
    const item = own.items.find((i: any) => i.targetId === COMMENT)!;
    expect(item.reports).toBe(2);
    expect(item.excerpt?.text).not.toContain('<b>');
    expect(JSON.stringify(own)).not.toContain(REP1);
    expect(JSON.stringify(own)).not.toMatch(/reporter/i);
    const foreign = await Effect.runPromise(listModerationQueue({ organizationId: ORG2, keys, status: 'open', page: 1, pageSize: 50, locale: 'fr' }));
    expect(foreign.items.some((i: any) => i.targetId === COMMENT)).toBe(false);
  });
});

describe('moderation — décisions', () => {
  it('masque, historise, audite et publie dans la même transaction, sans contenu ni signaleur', async () => {
    const result = await decide({ target: 'blog.comment', id: COMMENT, decision: 'hide', reasonCode: 'spam', note }, ctx({ id: OWNER1 }));
    expect(result.changed).toBe(true);
    const [row] = await db().select({ status: blogComments.status }).from(blogComments).where(eq(blogComments.id, COMMENT));
    expect(row.status).toBe('REJECTED');
    expect((await reportsFor(COMMENT)).every((r) => r.status === 'resolved')).toBe(true);
    const actions = await db().select().from(moderationActions).where(and(eq(moderationActions.targetId, COMMENT), eq(moderationActions.action, 'hide')));
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ actorId: OWNER1, note, fromStatus: 'APPROVED', toStatus: 'REJECTED', organizationId: ORG1 });
    const audits = await db().select().from(auditLog).where(and(eq(auditLog.resourceId, COMMENT), eq(auditLog.action, 'moderation.blog.hide')));
    expect(audits).toHaveLength(1);
    const audit = JSON.stringify(audits[0]);
    for (const secret of ['secret', note, REP1, '198.51', '203.0.113']) expect(audit).not.toContain(secret);
    const events = await db().select().from(eventOutbox).where(and(eq(eventOutbox.name, MODERATION_DECIDED_EVENT), sql`${eventOutbox.payload}->>'targetId' = ${COMMENT}`));
    expect(events).toHaveLength(1);
    expect(Object.keys(events[0].payload as object).sort()).toEqual(['actionId', 'decision', 'module', 'targetId', 'targetType']);
    expect(JSON.stringify(events[0].payload)).not.toContain('secret');
  });

  it('est idempotent : une seconde décision identique ne change rien', async () => {
    const again = await decide({ target: 'blog.comment', id: COMMENT, decision: 'hide', note }, ctx({ id: OWNER1 }));
    expect(again.changed).toBe(false);
    expect(await db().select().from(moderationActions).where(and(eq(moderationActions.targetId, COMMENT), eq(moderationActions.action, 'hide')))).toHaveLength(1);
  });

  it("n'applique qu'une décision concurrente", async () => {
    const results = await Promise.all([1, 2, 3].map(() => decide({ target: 'blog.comment', id: RACE, decision: 'spam', note }, ctx({ id: OWNER1 }))));
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(await db().select().from(moderationActions).where(eq(moderationActions.targetId, RACE))).toHaveLength(1);
    expect(await db().select().from(eventOutbox).where(sql`${eventOutbox.payload}->>'targetId' = ${RACE}`)).toHaveLength(1);
  });

  it("annule action, audit et outbox quand l'effet métier échoue", async () => {
    registerModuleModeration(defineModuleModeration('probe', [{
      type: 'comment', permission: { blogComment: ['moderate'] }, reporters: 'anyone',
      load: (executor: any, targetId: string) => Effect.succeed({ organizationId: ORG1, siteId: null, authorId: AUTHOR, status: 'APPROVED', publiclyVisible: true, targetId, executor }) as any,
      excerpt: () => Effect.succeed(null),
      apply: (executor: any) => dbTry('probe', () => executor.update(blogComments).set({ status: 'REJECTED' }).where(eq(blogComments.id, PROBE))).pipe(Effect.flatMap(() => Effect.fail(new Error('boom') as never))),
    }] as any));
    const exit = await Effect.runPromiseExit(decideModeration({ key: 'probe.comment', targetId: PROBE, decision: 'hide', actorId: OWNER1, organizationId: ORG1, note }));
    expect(exit._tag).toBe('Failure');
    const [row] = await db().select({ status: blogComments.status }).from(blogComments).where(eq(blogComments.id, PROBE));
    expect(row.status).toBe('APPROVED');
    expect(await db().select().from(moderationActions).where(eq(moderationActions.targetId, PROBE))).toHaveLength(0);
    expect(await db().select().from(auditLog).where(eq(auditLog.resourceId, PROBE))).toHaveLength(0);
    expect(await db().select().from(eventOutbox).where(sql`${eventOutbox.payload}->>'targetId' = ${PROBE}`)).toHaveLength(0);
  });

  it("rétablit le contenu et notifie l'auteur selon ses préférences", async () => {
    const restored = await decide({ target: 'blog.comment', id: COMMENT, decision: 'restore', note }, ctx({ id: OWNER1 }));
    expect(restored.changed).toBe(true);
    const [row] = await db().select({ status: blogComments.status }).from(blogComments).where(eq(blogComments.id, COMMENT));
    expect(row.status).toBe('APPROVED');
    const events = await db().select().from(eventOutbox).where(and(eq(eventOutbox.name, MODERATION_DECIDED_EVENT), sql`${eventOutbox.payload}->>'targetId' = ${COMMENT}`)).orderBy(eventOutbox.occurredAt);
    const toEvent = (e: any) => ({ id: e.id, name: e.name, occurredAt: new Date(e.occurredAt).toISOString(), siteId: null, organizationId: e.organizationId ?? null, payload: e.payload });
    await Effect.runPromise(handleNotificationEvent(toEvent(events[1]) as any));
    await Effect.runPromise(handleNotificationEvent(toEvent(events[1]) as any));
    const mine = await db().select().from(notifications).where(and(eq(notifications.userId, AUTHOR), eq(notifications.category, 'moderation')));
    expect(mine.map((n) => n.type)).toEqual(['CONTENT_RESTORED']);
    expect(JSON.stringify(mine[0].data)).not.toContain(OWNER1);
    await Effect.runPromise(setNotificationPreference(AUTHOR, 'moderation', 'in_app', false));
    await Effect.runPromise(handleNotificationEvent(toEvent(events[0]) as any));
    expect(await db().select().from(notifications).where(and(eq(notifications.userId, AUTHOR), eq(notifications.type, 'CONTENT_HIDDEN')))).toHaveLength(0);
  });

  it('recalcule la note du service quand un avis est masqué puis rétabli', async () => {
    await decide({ target: 'services.review', id: SREVIEW2, decision: 'hide', note }, ctx({ id: OWNER1 }));
    let [svc] = await db().select({ avg: services.ratingAverage100, count: services.ratingCount }).from(services).where(eq(services.id, SERVICE));
    expect(svc).toEqual({ avg: 500, count: 1 });
    await decide({ target: 'services.review', id: SREVIEW2, decision: 'restore', note }, ctx({ id: ADMIN, role: 'admin' }));
    [svc] = await db().select({ avg: services.ratingAverage100, count: services.ratingCount }).from(services).where(eq(services.id, SERVICE));
    expect(svc).toEqual({ avg: 300, count: 2 });
  });

  it('classe sans suite les signalements sans modifier la publication', async () => {
    const res = await resolve({ target: 'services.service', id: SERVICE, outcome: 'dismissed', note }, ctx({ id: OWNER1 }));
    expect(res.changed).toBe(true);
    expect((await reportsFor(SERVICE)).map((r) => r.status)).toEqual(['dismissed']);
    const [svc] = await db().select({ status: services.status }).from(services).where(eq(services.id, SERVICE));
    expect(svc.status).toBe('PUBLISHED');
    expect((await resolve({ target: 'services.service', id: SERVICE, outcome: 'dismissed', note }, ctx({ id: OWNER1 }))).changed).toBe(false);
    expect(await db().select().from(moderationActions).where(and(eq(moderationActions.targetId, SERVICE), eq(moderationActions.action, 'dismiss')))).toHaveLength(1);
  });
});
