/** Cœur notifications (N2-A / N5-A) : préférences, idempotence, abonné du bus (base réelle). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { eq } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { notifications, user } from '@/database/schemas';
import { listNotifications, markNotificationsRead, notify, setNotificationPreference, unreadNotificationCount } from '@/core/notifications/service';
import { handleNotificationEvent, notificationDedupeKey } from '@/core/notifications/subscriber';
import { clearNotificationDefinitionsForTests, defineModuleNotifications, registerNotificationDefinitions } from '@/core/notifications/registry';

const db = getDrizzle();
const tag = `nc-${Date.now()}`;
const userId = crypto.randomUUID();
const run = <A, E>(e: Effect.Effect<A, E>) => Effect.runPromise(e);

beforeAll(async () => {
  await db.insert(user).values({ id: userId, name: 'N', email: `${tag}@example.test`, emailVerified: true });
});
afterAll(async () => {
  clearNotificationDefinitionsForTests();
  await db.delete(user).where(eq(user.id, userId));
});

describe('notifications core', () => {
  it('creates, counts, lists and marks read (scoped to the recipient)', async () => {
    const id = await run(notify({ userId, module: 'demo', type: 'HELLO', category: 'system', title: 't' }));
    expect(id).toBeTruthy();
    expect(await run(unreadNotificationCount({ userId, module: 'demo' }))).toBe(1);
    expect((await run(listNotifications({ userId }))).map((n) => n.id)).toContain(id);
    expect(await run(markNotificationsRead({ userId: crypto.randomUUID() }, [id!]))).toBe(0);
    expect(await run(markNotificationsRead({ userId }, [id!]))).toBe(1);
    expect(await run(markNotificationsRead({ userId }, [id!]))).toBe(0);
    expect(await run(unreadNotificationCount({ userId, module: 'demo' }))).toBe(0);
  });

  it('respects the in-app preference of the category', async () => {
    await run(setNotificationPreference(userId, 'muted', 'in_app', false));
    expect(await run(notify({ userId, module: 'demo', type: 'HELLO', category: 'muted' }))).toBeNull();
    await run(setNotificationPreference(userId, 'muted', 'in_app', true));
    expect(await run(notify({ userId, module: 'demo', type: 'HELLO', category: 'muted' }))).toBeTruthy();
  });

  it('the bus subscriber is idempotent per event, type and recipient', async () => {
    registerNotificationDefinitions(defineModuleNotifications('demo', [
      { type: 'DONE', category: 'system', channels: ['in_app'], event: 'demo.done', recipients: (e) => Effect.succeed([{ userId, organizationId: null, resourceType: 'thing', resourceId: String(e.payload.thingId) }]) },
    ]));
    const event = { id: crypto.randomUUID(), name: 'demo.done', occurredAt: new Date().toISOString(), siteId: null, organizationId: null, payload: { thingId: 'x1' } };
    expect(await run(handleNotificationEvent(event))).toBe(1);
    expect(await run(handleNotificationEvent(event))).toBe(0);
    const rows = await db.select().from(notifications).where(eq(notifications.dedupeKey, notificationDedupeKey(event.id, 'DONE', userId)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ module: 'demo', resourceType: 'thing', resourceId: 'x1', category: 'system' });
  });
});
