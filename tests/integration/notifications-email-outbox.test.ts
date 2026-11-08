/** File e-mail des notifications (N3-A / N5-A) : idempotence, préférences, retries, abandon, désinscription. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Effect, Layer } from 'effect';
import { eq, like } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { emailOutbox, user } from '@/database/schemas';
import { AppConfig, appConfigFrom } from '@/lib/effect/config';
import { enqueueEmail, processEmailOutbox, cancelPendingEmails, EMAIL_OUTBOX_MAX_ATTEMPTS, type EmailSender } from '@/core/notifications/email-outbox';
import { clearEmailTemplatesForTests, defineEmailTemplate, registerEmailTemplates } from '@/core/notifications/email-templates';
import { setNotificationPreference } from '@/core/notifications/service';
import { verifyUnsubscribeToken } from '@/core/notifications/unsubscribe';
import type { EmailPayload } from '@/smtp/types';

const db = getDrizzle();
const tag = `eo-${Date.now()}`;
const userId = crypto.randomUUID();
const config = appConfigFrom({ NODE_ENV: 'test', SITE_URL: 'https://site.test', POLYWEB_SIGNING_SECRET: 'test-secret' });
const run = <A, E>(e: Effect.Effect<A, E, AppConfig>) => Effect.runPromise(e.pipe(Effect.provide(Layer.succeed(AppConfig, config))));
const template = defineEmailTemplate<{ n: number }>({
  id: 'demo.hello',
  parse: (d) => (typeof d.n === 'number' ? { n: d.n } : null),
  render: ({ n }) => ({ subject: `Hello ${n}`, heading: 'H', greeting: 'G', body: 'B', buttonText: 'Go', buttonUrl: 'https://site.test/x', footnote: 'F' }),
});
const sent: EmailPayload[] = [];
const ok: EmailSender = (p) => Effect.sync(() => void sent.push(p));
const transient: EmailSender = () => Effect.fail({ _tag: 'SmtpProviderError' });
const key = (s: string) => `${tag}:${s}`;
const rowOf = async (k: string) => (await db.select().from(emailOutbox).where(eq(emailOutbox.dedupeKey, key(k))))[0]!;
const enqueue = async (k: string, extra: Partial<Parameters<typeof enqueueEmail>[0]> = {}) => {
  const id = await run(enqueueEmail({ dedupeKey: key(k), userId, toEmail: 'dest@example.test', locale: 'en', template: 'demo.hello', category: 'billing', data: { n: 1 }, ...extra }));
  if (id) ids.push(id);
  return id;
};
// Les fichiers d'intégration tournent en parallèle : on ne traite que les lignes de ce test.
const ids: string[] = [];
const process = (now: Date, send: EmailSender) => run(processEmailOutbox({ limit: 200, now, send, ids }));

beforeAll(async () => {
  registerEmailTemplates([template]);
  await db.insert(user).values({ id: userId, name: 'E', email: `${tag}@example.test`, emailVerified: true });
});
beforeEach(() => {
  sent.length = 0;
});
afterAll(async () => {
  clearEmailTemplatesForTests();
  await db.delete(emailOutbox).where(like(emailOutbox.dedupeKey, `${tag}:%`));
  await db.delete(user).where(eq(user.id, userId));
});

describe('email outbox', () => {
  it('enqueues once per key and sends with List-Unsubscribe headers and a valid signed link', async () => {
    expect(await enqueue('a')).toBeTruthy();
    expect(await enqueue('a')).toBeNull();
    expect(await process(new Date(Date.now() + 1000), ok)).toEqual({ sent: 1, retry: 0, failed: 0, skipped: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe('Hello 1');
    const header = sent[0]!.headers!['List-Unsubscribe']!;
    expect(sent[0]!.headers!['List-Unsubscribe-Post']).toBeUndefined();
    const token = decodeURIComponent(/token=([^>]+)>/.exec(header)![1]!);
    expect(header.startsWith('<https://site.test/en/notifications/unsubscribe?token=')).toBe(true);
    expect(verifyUnsubscribeToken(token, 'test-secret')).toMatchObject({ userId, category: 'billing', channel: 'email' });
    expect(await rowOf('a')).toMatchObject({ status: 'sent', attempts: 1 });
    expect(await process(new Date(Date.now() + 2000), ok)).toEqual({ sent: 0, retry: 0, failed: 0, skipped: 0 });
  });

  it('retries transient failures with backoff, then gives up', async () => {
    await enqueue('b');
    let now = new Date(Date.now() + 1000);
    for (let i = 1; i < EMAIL_OUTBOX_MAX_ATTEMPTS; i++) {
      expect(await process(now, transient)).toMatchObject({ retry: 1 });
      const row = await rowOf('b');
      expect(row).toMatchObject({ status: 'pending', attempts: i, lastError: 'SmtpProviderError' });
      expect(await process(now, ok)).toMatchObject({ sent: 0 });
      now = new Date(row.nextAttemptAt.getTime() + 1);
    }
    expect(await process(now, transient)).toMatchObject({ failed: 1 });
    expect(await rowOf('b')).toMatchObject({ status: 'failed', attempts: EMAIL_OUTBOX_MAX_ATTEMPTS });
  });

  it('fails permanently on invalid data, skips muted categories, cancels by key', async () => {
    await enqueue('c', { data: { n: 'bad' } });
    expect(await process(new Date(Date.now() + 1000), ok)).toMatchObject({ failed: 1 });
    expect(await rowOf('c')).toMatchObject({ status: 'failed', lastError: 'InvalidEmailTemplateData' });

    await enqueue('d');
    await run(setNotificationPreference(userId, 'billing', 'email', false));
    expect(await enqueue('e')).toBeNull();
    expect(await process(new Date(Date.now() + 1000), ok)).toMatchObject({ skipped: 1 });
    expect(await rowOf('d')).toMatchObject({ status: 'cancelled' });
    await run(setNotificationPreference(userId, 'billing', 'email', true));

    await enqueue('f', { notBefore: new Date(Date.now() + 3_600_000) });
    expect(await process(new Date(Date.now() + 1000), ok)).toMatchObject({ sent: 0 });
    expect(await run(cancelPendingEmails([key('f')]))).toBe(1);
    expect(sent).toHaveLength(0);
  });
});
