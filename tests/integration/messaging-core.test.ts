import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
vi.mock('astro:actions', () => ({ ActionError: class extends Error { code: string; constructor(o: any) { super(o.message); this.code = o.code; } }, defineAction: (d: any) => d }));
import { and, eq, like, sql } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { eventOutbox, member, messagingBlocks, messagingConversationStates, messagingConversations, messagingMessages, messagingPreferences, organization, user } from '@database/schemas';
import { messaging } from '@/actions/messaging';
import { registerModerationTargets } from '@/modules/moderation';
import { MESSAGING_MESSAGE_CREATED_EVENT } from '@/core/messaging/service';
import { resetRateLimiter } from '@/lib/rate-limit';

const call = (a: any) => a.handler as (i: any, c: any) => Promise<any>;
const start = call(messaging.start); const send = call(messaging.send); const can = call(messaging.canMessage);
const prefSet = call(messaging.preferenceSet); const block = call(messaging.block); const del = call(messaging.deleteForMe);
const report = call(messaging.report); const list = call(messaging.list);
const tag = `mg${Date.now()}`; const id = (n: number) => `${tag}-0000-0000-0000-${String(n).padStart(12, '0')}`;
const A = id(1), B = id(2), C = id(3), ORG = id(10); const db = () => getDrizzle();
const ctx = (uid: string) => ({ locals: { user: { id: uid, role: 'user', banned: false, email: `${uid}@t.test`, name: 'T' }, site: null }, request: new Request('http://localhost/'), clientAddress: '127.0.0.1', cookies: { get: () => undefined } });
const err = async (p: Promise<unknown>) => p.then(() => null, (e: any) => ({ code: e.code, message: e.message }));

beforeAll(async () => {
  registerModerationTargets();
  await db().insert(user).values([A, B, C].map((u) => ({ id: u, name: u.slice(-2), email: `${u}@t.test`, emailVerified: true })) as any);
  await db().insert(organization).values({ id: ORG, name: 'O', slug: `${tag}-o`, createdAt: new Date() } as any);
  await db().insert(member).values([
    { id: id(20), organizationId: ORG, userId: A, role: 'member', createdAt: new Date() },
    { id: id(21), organizationId: ORG, userId: B, role: 'member', createdAt: new Date() },
  ] as any);
});
beforeEach(() => resetRateLimiter());
afterAll(async () => {
  await db().delete(messagingMessages).where(sql`true`);
  await db().delete(messagingConversationStates).where(like(messagingConversationStates.userId, `${tag}%`));
  await db().delete(messagingConversations).where(like(messagingConversations.userLo, `${tag}%`));
  await db().delete(messagingBlocks).where(like(messagingBlocks.blockerId, `${tag}%`));
  await db().delete(messagingPreferences).where(like(messagingPreferences.userId, `${tag}%`));
  await db().delete(eventOutbox).where(sql`${eventOutbox.payload}->>'senderId' like ${`${tag}%`}`);
  await db().delete(organization).where(eq(organization.id, ORG));
  await db().delete(user).where(like(user.id, `${tag}%`));
});

describe('messagerie', () => {
  it('NOT_FOUND indiscernable (tiers, absent, nobody, bloc)', async () => {
    expect(await can({ userId: B }, ctx(A))).toEqual({ ok: true });
    const missing = await err(can({ userId: id(99) }, ctx(A)));
    expect(await err(can({ userId: C }, ctx(A)))).toEqual(missing);
    await prefSet({ whoCanMessage: 'nobody' }, ctx(B));
    expect(await err(can({ userId: B }, ctx(A)))).toEqual(missing);
    await prefSet({ whoCanMessage: 'everyone' }, ctx(B));
    expect(await can({ userId: B }, ctx(C))).toEqual({ ok: true });
    await block({ userId: C, blocked: true }, ctx(B));
    expect(await err(can({ userId: B }, ctx(C)))).toEqual(missing);
    await block({ userId: C, blocked: false }, ctx(B));
    await prefSet({ whoCanMessage: 'shared_org' }, ctx(B));
    expect(missing?.code).toBe('NOT_FOUND');
  });

  it('envoie sans corps dans outbox ; tombstone ; signalement participant', async () => {
    const sent = await start({ userId: B, body: '<b>Secret</b> hello' }, ctx(A));
    const [msg] = await db().select().from(messagingMessages).where(eq(messagingMessages.id, sent.messageId));
    expect(msg.body).toBe('Secret hello');
    const events = await db().select().from(eventOutbox).where(and(eq(eventOutbox.name, MESSAGING_MESSAGE_CREATED_EVENT), sql`${eventOutbox.payload}->>'messageId' = ${sent.messageId}`));
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0].payload)).not.toContain('Secret');
    await del({ conversationId: sent.conversationId }, ctx(A));
    expect((await list({}, ctx(A))).items.some((i: any) => i.id === sent.conversationId)).toBe(false);
    await send({ conversationId: sent.conversationId, body: 'reprise' }, ctx(A));
    expect((await list({}, ctx(A))).items.some((i: any) => i.id === sent.conversationId)).toBe(true);
    expect(await report({ messageId: sent.messageId, reason: 'spam' }, ctx(A))).toEqual({ accepted: true });
    expect((await err(report({ messageId: sent.messageId, reason: 'spam' }, ctx(C))))?.code).toBe('NOT_FOUND');
  });
});
