/** Désinscription « un clic » RFC 8058 (D1) : jeton signé seul, hôte de confiance, corps exact, rejouable, sans cookie. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { notificationPreferences, user } from '@/database/schemas';
import { appConfigFrom } from '@/lib/effect/config';
import { isForbiddenCrossOriginRequest } from '@/lib/security/origin-check';
import { ONE_CLICK_BODY, ONE_CLICK_UNSUBSCRIBE_PATH, signUnsubscribeToken } from '@/core/notifications/unsubscribe';
import { GET, POST } from '@/pages/api/notifications/unsubscribe/one-click';

const db = getDrizzle();
const userId = `oc-${Date.now().toString(36)}`;
// Même configuration que celle de l'appRuntime (process.env) : secret et hôte de confiance.
const config = appConfigFrom(process.env);
const site = new URL(config.siteUrl);
const FORM = 'application/x-www-form-urlencoded';
const tokenFor = (claims: Partial<Parameters<typeof signUnsubscribeToken>[0]> = {}, now = Date.now(), secret = config.signingSecret) =>
  signUnsubscribeToken({ userId, category: 'comments', channel: 'email', ...claims }, secret, now);

const call = async (
  handler: typeof POST,
  { token = tokenFor(), method = 'POST', body = ONE_CLICK_BODY, contentType = FORM, host = site.host, path = ONE_CLICK_UNSUBSCRIBE_PATH, cookie }: { token?: string; method?: string; body?: string | null; contentType?: string | null; host?: string; path?: string; cookie?: string } = {},
) => {
  const url = new URL(`${path}?token=${encodeURIComponent(token)}&lang=es`, `${site.protocol}//${host}`);
  const headers: Record<string, string> = { host };
  if (contentType) headers['content-type'] = contentType;
  if (cookie) headers.cookie = cookie;
  const request = new Request(url, { method, headers, ...(method === 'POST' && body !== null ? { body } : {}) });
  // Garde : la requête atteint le handler sans être refusée par le contrôle d'Origin (comme le middleware).
  return { response: await handler({ request, url, locals: {}, cookies: undefined } as never), forbidden: isForbiddenCrossOriginRequest(request, url) };
};
const pref = async () =>
  (await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.category, 'comments'), eq(notificationPreferences.channel, 'email'))))[0];

beforeAll(async () => {
  await db.insert(user).values({ id: userId, name: 'One click', email: `${userId}@example.test`, emailVerified: true });
});
afterAll(async () => {
  await db.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  await db.delete(user).where(eq(user.id, userId));
});

describe('RFC 8058 one-click unsubscribe endpoint', () => {
  it('rejects invalid, expired, forged and in-app tokens without any effect', async () => {
    for (const token of ['', 'garbage', tokenFor({}, Date.now() - 61 * 24 * 3_600_000), tokenFor({}, Date.now(), 'other-secret'), tokenFor({ channel: 'in_app' }), 'x'.repeat(2000)]) {
      const { response } = await call(POST, { token });
      expect(response.status).toBe(400);
    }
    expect(await pref()).toBeUndefined();
  });

  it('rejects an untrusted host, a wrong body or content type', async () => {
    expect((await call(POST, { host: 'evil.test' })).response.status).toBe(400);
    expect((await call(POST, { body: 'List-Unsubscribe=Yes' })).response.status).toBe(400);
    expect((await call(POST, { body: '' })).response.status).toBe(400);
    expect((await call(POST, { contentType: 'text/plain' })).response.status).toBe(415);
    expect((await call(POST, { contentType: 'application/json', body: '{}' })).response.status).toBe(415);
    expect(await pref()).toBeUndefined();
  });

  it('disables the email channel of the token category, idempotently on replay, without cookies', async () => {
    const token = tokenFor();
    const first = await call(POST, { token, cookie: 'better-auth.session_token=forged' });
    expect(first.forbidden).toBe(false);
    expect(first.response.status).toBe(200);
    expect(first.response.headers.get('set-cookie')).toBeNull();
    expect(first.response.headers.get('cache-control')).toBe('no-store');
    expect(await pref()).toMatchObject({ enabled: false });
    const replay = await call(POST, { token });
    expect(replay.response.status).toBe(200);
    expect(await pref()).toMatchObject({ enabled: false });
  });

  it('GET never mutates: redirects to the human confirmation page in the requested locale', async () => {
    await db.update(notificationPreferences).set({ enabled: true }).where(eq(notificationPreferences.userId, userId));
    const token = tokenFor();
    const { response } = await call(GET, { token, method: 'GET', contentType: null });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${config.siteUrl}/es/notifications/unsubscribe?token=${encodeURIComponent(token)}`);
    expect(await pref()).toMatchObject({ enabled: true });
    expect((await call(GET, { method: 'GET', contentType: null, host: 'evil.test' })).response.status).toBe(400);
  });

  it('only the exact path, method and form content type bypass the Origin check', async () => {
    expect((await call(POST, { path: `${ONE_CLICK_UNSUBSCRIBE_PATH}/x` })).forbidden).toBe(true);
    expect((await call(POST, { path: '/api/notifications/unsubscribe' })).forbidden).toBe(true);
    expect((await call(POST, { contentType: 'multipart/form-data; boundary=x' })).forbidden).toBe(true);
    expect((await call(POST, { contentType: 'text/plain' })).forbidden).toBe(true);
  });
});
