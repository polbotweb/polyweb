import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { getDrizzle, schema } from '@database/drizzle';
import { appRuntime } from '@/lib/effect/runtime';
import { createWebhook, listDeliveries, getWebhook } from '@/modules/webhooks/domain/webhooks';
import { dispatchEvent, processDueDeliveries, redeliver, sendPing } from '@/modules/webhooks/domain/dispatcher';
import { verifyWebhookSignature } from '@/modules/webhooks/domain/signing';
import { registerWebhookDispatcher } from '@/modules/webhooks/subscribe';
import { createEntry } from '@/modules/content/domain/entries';
import { createTestSite, removeTestSite, createArticleType } from '../../helpers/platform';
import type { Site } from '@/modules/sites/domain/sites';
import type { PolywebEvent } from '@/core/events';

interface Received { headers: IncomingMessage['headers']; body: string; path: string }
let server: Server;
let base: string;
const received: Received[] = [];
let nextStatus = 200;
let site: Site;

const run = <A, E>(e: Effect.Effect<A, E, never> | Effect.Effect<A, E, any>) => appRuntime.runPromise(e as Effect.Effect<A, E, never>);

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body, path: req.url ?? '' });
      res.statusCode = nextStatus;
      res.end(nextStatus === 200 ? 'ok' : 'nope');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  site = await createTestSite('hooks');
});
afterAll(async () => {
  await removeTestSite(site.id);
  await new Promise((r) => server.close(r));
});

const event = (name: PolywebEvent['name'], payload: Record<string, unknown> = {}): PolywebEvent => ({
  id: crypto.randomUUID(), name, occurredAt: new Date().toISOString(), siteId: site.id, payload,
});

describe('webhooks', () => {
  it('rejects invalid definitions', async () => {
    const e = await run(Effect.flip(createWebhook(site.id, { name: '', url: 'nope', events: [] }, null)));
    expect(e._tag).toBe('ValidationError');
  });

  it('delivers signed payloads only to matching subscribers', async () => {
    const { secret, webhook } = await run(createWebhook(site.id, { name: 'content', url: `${base}/content`, events: ['content.*'] }, null));
    await run(createWebhook(site.id, { name: 'forms', url: `${base}/forms`, events: ['form.submitted'] }, null));
    expect(secret).toMatch(/^whsec_/);
    received.length = 0;
    const outcomes = await run(dispatchEvent(event('content.published', { slug: 'x' })));
    expect(outcomes.map((o) => o.status)).toEqual(['success']);
    expect(received).toHaveLength(1);
    const r = received[0]!;
    expect(r.path).toBe('/content');
    expect(r.headers['polyweb-event']).toBe('content.published');
    expect(verifyWebhookSignature(r.headers['polyweb-signature'] as string, r.body, secret)).toBe(true);
    expect(JSON.parse(r.body)).toMatchObject({ event: 'content.published', siteId: site.id, data: { slug: 'x' } });
    const deliveries = await run(listDeliveries(webhook.id));
    expect(deliveries[0]).toMatchObject({ status: 'success', attempts: 1, lastStatusCode: 200 });
  });

  it('schedules retries with backoff, then succeeds via the cron processor', async () => {
    const { webhook } = await run(createWebhook(site.id, { name: 'flaky', url: `${base}/flaky`, events: ['form.submitted'] }, null));
    nextStatus = 500;
    const [first] = await run(dispatchEvent(event('form.submitted')));
    const flakyOutcome = (await run(listDeliveries(webhook.id)))[0]!;
    expect(first?.status === 'failed' || flakyOutcome.status === 'failed').toBe(true);
    expect(flakyOutcome.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 20_000);
    // Not due yet → cron skips it
    expect((await run(processDueDeliveries())).processed).toBe(0);
    await getDrizzle().update(schema.webhookDeliveries).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(schema.webhookDeliveries.id, flakyOutcome.id));
    nextStatus = 200;
    const res = await run(processDueDeliveries());
    expect(res.succeeded).toBeGreaterThanOrEqual(1);
    expect((await run(listDeliveries(webhook.id)))[0]).toMatchObject({ status: 'success', attempts: 2 });
    expect((await run(getWebhook(site.id, webhook.id))).consecutiveFailures).toBe(0);
  });

  it('marks 410 Gone as dead and disables the webhook; manual redelivery works', async () => {
    const { webhook } = await run(createWebhook(site.id, { name: 'gone', url: `${base}/gone`, events: ['media.deleted'] }, null));
    nextStatus = 410;
    await run(dispatchEvent(event('media.deleted')));
    const [d] = await run(listDeliveries(webhook.id));
    expect(d!.status).toBe('dead');
    const hook = await run(getWebhook(site.id, webhook.id));
    expect(hook.active).toBe(false);
    expect(hook.disabledReason).toMatch(/410/);
    nextStatus = 200;
    expect((await run(redeliver(d!.id))).status).toBe('success');
  });

  it('records network failures (connection refused) without throwing', async () => {
    const { webhook } = await run(createWebhook(site.id, { name: 'down', url: 'http://127.0.0.1:1/x', events: ['payment.failed'] }, null));
    const outcome = await run(sendPing(webhook.id, site.id));
    expect(outcome.status).toBe('failed');
    expect(outcome.error).toBeTruthy();
  });

  it('is wired to the event bus: creating an entry triggers content.created', async () => {
    registerWebhookDispatcher();
    const { webhook } = await run(createWebhook(site.id, { name: 'bus', url: `${base}/bus`, events: ['content.created'] }, null));
    const type = await createArticleType(site.id, { slug: `bus-${Date.now()}` });
    received.length = 0;
    await createEntry(type, { translations: { fr: { title: 'Bus', data: { summary: 's' } } } }, { authorId: null, allowedLocales: ['fr'] });
    for (let i = 0; i < 50 && !received.some((r) => r.path === '/bus'); i++) await new Promise((r) => setTimeout(r, 50));
    const hit = received.find((r) => r.path === '/bus');
    expect(hit).toBeDefined();
    expect(JSON.parse(hit!.body).data.slug).toBe('bus');
    expect((await run(listDeliveries(webhook.id)))[0]!.event).toBe('content.created');
  });
});
