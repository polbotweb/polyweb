import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Effect, Exit } from 'effect';
import { appRuntime } from '@/lib/effect/runtime';
import { Mailer, makeMemoryMailer } from '@/smtp/mailer';
import {
  createForm, updateForm, getForm, listForms, deleteForm, submitForm, listSubmissions, setSubmissionStatus,
  exportSubmissionsCsv, formTimestampToken, checkTimestampToken, csvCell,
} from '@/modules/forms/domain/forms';
import { createTestSite, removeTestSite } from '../../helpers/platform';
import type { Site } from '@/modules/sites/domain/sites';

let site: Site;
const mailer = makeMemoryMailer();
const run = <A, E>(e: Effect.Effect<A, E, any>) => appRuntime.runPromise(Effect.provideService(e, Mailer, mailer) as Effect.Effect<A, E, never>);
const runExit = <A, E>(e: Effect.Effect<A, E, any>) => appRuntime.runPromiseExit(Effect.provideService(e, Mailer, mailer) as Effect.Effect<A, E, never>);
const tag = (exit: Exit.Exit<unknown, unknown>) => (Exit.isFailure(exit) ? (exit.cause.reasons.find((r) => r._tag === 'Fail') as { error: { _tag: string } } | undefined)?.error._tag : 'success');
const meta = (ip: string) => ({ ip, userAgent: 'vitest', locale: 'fr', requireTimestamp: false });

const fields = [
  { name: 'email', label: { fr: 'E-mail' }, type: 'email', required: true },
  { name: 'message', label: { fr: 'Message' }, type: 'textarea', required: true },
  { name: 'topic', label: { fr: 'Sujet' }, type: 'select', options: [{ value: 'devis', label: { fr: 'Devis' } }, { value: 'support', label: { fr: 'Support' } }] },
];

beforeAll(async () => {
  site = await createTestSite('forms');
});
afterAll(async () => {
  await removeTestSite(site.id);
});

describe('form builder (brick g)', () => {
  it('creates, validates and enforces unique slug', async () => {
    const form = await run(createForm(site.id, { name: 'Contact', slug: 'contact', fields, settings: { notifyEmails: ['ops@example.test'] } }));
    expect(form.slug).toBe('contact');
    expect(tag(await runExit(createForm(site.id, { name: 'Bis', slug: 'contact', fields })))).toBe('ConflictError');
    expect(tag(await runExit(createForm(site.id, { name: 'Bad', slug: 'Bad Slug!', fields })))).toBe('ValidationError');
    // les types non autorisés dans un formulaire (ex. richtext, media) sont refusés
    expect(tag(await runExit(createForm(site.id, { name: 'X', slug: 'x', fields: [{ name: 'body', label: { fr: 'B' }, type: 'richtext' }] })))).toBe('ValidationError');
    const listed = await run(listForms(site.id));
    expect(listed.map((f) => f.slug)).toEqual(['contact']);
    expect((await run(getForm(site.id, form.id))).id).toBe(form.id);
  });

  it('accepts a valid submission, stores it, notifies and validates input', async () => {
    mailer.sent.length = 0;
    const ok = await run(submitForm(site.id, 'contact', { email: 'a@b.test', message: 'Bonjour\nmonde', topic: 'devis' }, meta('10.0.0.1')));
    expect(ok.status).toBe('accepted');
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('ops@example.test');
    expect(mailer.sent[0]!.html).toContain('Bonjour<br>monde');
    const bad = await runExit(submitForm(site.id, 'contact', { email: 'pas-un-email', message: '', topic: 'autre' }, meta('10.0.0.1')));
    expect(tag(bad)).toBe('ValidationError');
    const form = await run(getForm(site.id, 'contact'));
    const { items, total } = await run(listSubmissions(form.id, {}));
    expect(total).toBe(1);
    expect(items[0]!.data).toMatchObject({ email: 'a@b.test', topic: 'devis' });
    expect(items[0]!.ipHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('honeypot discards, missing timestamp is stored as spam without notification', async () => {
    mailer.sent.length = 0;
    const form = await run(getForm(site.id, 'contact'));
    const hp = await run(submitForm(site.id, 'contact', { email: 'bot@b.test', message: 'spam', _hp: 'x' }, meta('10.0.0.2')));
    expect(hp.status).toBe('discarded');
    const noTs = await run(submitForm(site.id, 'contact', { email: 'c@b.test', message: 'vite' }, { ...meta('10.0.0.2'), requireTimestamp: true }));
    expect(noTs.status).toBe('discarded');
    expect(mailer.sent).toHaveLength(0);
    const spam = await run(listSubmissions(form.id, { status: 'spam' }));
    expect(spam.total).toBe(1);
    await run(setSubmissionStatus(form.id, spam.items[0]!.id, 'read'));
    expect((await run(listSubmissions(form.id, { status: 'read' }))).total).toBe(1);
  });

  it('timestamp token: too fast is rejected, human delay accepted, tampering rejected', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const token = await run(formTimestampToken);
      expect(await run(checkTimestampToken(token))).toBe(false);
      vi.setSystemTime(Date.now() + 5_000);
      expect(await run(checkTimestampToken(token))).toBe(true);
      expect(await run(checkTimestampToken(token.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))))).toBe(false);
      vi.setSystemTime(Date.now() + 25 * 3600_000);
      expect(await run(checkTimestampToken(token))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rate-limits per form and IP', async () => {
    const results = [];
    for (let i = 0; i < 7; i++) results.push(tag(await runExit(submitForm(site.id, 'contact', { email: `r${i}@b.test`, message: 'm' }, meta('10.9.9.9')))));
    expect(results.filter((r) => r === 'success').length).toBe(5);
    expect(results.at(-1)).toBe('RateLimitedError');
  });

  it('closed forms refuse submissions; CSV export neutralises formulas', async () => {
    const form = await run(getForm(site.id, 'contact'));
    await run(submitForm(site.id, 'contact', { email: 'x@b.test', message: '=HYPERLINK("http://evil")' }, meta('10.0.0.3')));
    const csv = await run(exportSubmissionsCsv(form, 'fr'));
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\r\n')[0]).toContain('E-mail');
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+1')).toBe(`"'+1"`);
    await run(updateForm(site.id, form.id, { name: form.name, slug: form.slug, fields: form.fields, status: 'closed' }));
    expect(tag(await runExit(submitForm(site.id, 'contact', { email: 'y@b.test', message: 'm' }, meta('10.0.0.4'))))).toBe('ConflictError');
    await run(deleteForm(site.id, form.id));
    expect(tag(await runExit(getForm(site.id, form.id)))).toBe('NotFoundError');
  });
});
