/** Relances planifiées (N6-A) : registre de sources, isolement des échecs ; gabarit de relance de facture (4 langues). */
import { afterEach, describe, expect, it } from 'vitest';
import { Data, Effect, Layer } from 'effect';
import { AppConfig, appConfigFrom } from '@/lib/effect/config';
import { clearReminderSourcesForTests, listReminderSources, registerReminderSources, runReminders } from '@/core/notifications/reminders';
import { clearEmailTemplatesForTests, registerEmailTemplates, renderNotificationEmail } from '@/core/notifications/email-templates';
import { invoiceReminderEmail } from '@/modules/sales/notifications/invoice-reminder-email';

class Boom extends Data.TaggedError('Boom')<object> {}
const config = appConfigFrom({ NODE_ENV: 'test', SITE_URL: 'https://site.test', POLYWEB_SIGNING_SECRET: 'test-secret' });
const run = <A, E>(e: Effect.Effect<A, E, AppConfig>) => Effect.runPromise(e.pipe(Effect.provide(Layer.succeed(AppConfig, config))));

afterEach(() => {
  clearReminderSourcesForTests();
  clearEmailTemplatesForTests();
});

describe('reminder sources', () => {
  it('rejects malformed ids', () => {
    expect(() => registerReminderSources([{ id: 'Bad Id', run: () => Effect.succeed(0) }])).toThrow(/Invalid reminder source id/);
  });

  it('runs every source, isolates failures and supports `only`', async () => {
    let calls = 0;
    registerReminderSources([
      { id: 'demo.ok', run: () => Effect.sync(() => ++calls) },
      { id: 'demo.ko', run: () => Effect.fail(new Boom()) },
    ]);
    expect(listReminderSources()).toHaveLength(2);
    expect(await run(runReminders())).toEqual([{ source: 'demo.ok', sent: 1 }, { source: 'demo.ko', sent: 0, error: 'Boom' }]);
    expect(await run(runReminders({ only: ['demo.ok'] }))).toEqual([{ source: 'demo.ok', sent: 2 }]);
  });
});

describe('sales.invoice-reminder template', () => {
  const data = { number: 'FA-2026-00001', level: 1, daysOverdue: 8, dueDate: '2026-04-01', amountDueMinor: 12345, currency: 'EUR', payPath: '/fr/pay/invoice/x?t=y' };

  it.each(['fr', 'en', 'es', 'ar'] as const)('renders text and HTML in %s', async (locale) => {
    registerEmailTemplates([invoiceReminderEmail]);
    const mail = await run(renderNotificationEmail('sales.invoice-reminder', data, { locale, siteUrl: 'https://site.test' }));
    expect(mail.subject).toContain('FA-2026-00001');
    expect(mail.subject).toContain('8');
    expect(mail.html).toContain('https://site.test/fr/pay/invoice/x?t=y');
    expect(mail.text).toContain('https://site.test/fr/pay/invoice/x?t=y');
  });

  it('falls back to the customer account without a pay link and rejects invalid data', async () => {
    registerEmailTemplates([invoiceReminderEmail]);
    const mail = await run(renderNotificationEmail('sales.invoice-reminder', { ...data, payPath: null }, { locale: 'en', siteUrl: 'https://site.test' }));
    expect(mail.text).toContain('https://site.test/en/account');
    for (const bad of [{ ...data, currency: 'XXQ' }, { ...data, payPath: '//evil.test' }, { ...data, amountDueMinor: -1 }, { ...data, dueDate: 'soon' }]) {
      await expect(run(renderNotificationEmail('sales.invoice-reminder', bad, { locale: 'en', siteUrl: 'https://site.test' }))).rejects.toThrow();
    }
  });
});
