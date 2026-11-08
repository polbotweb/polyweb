import { afterEach, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import {
  clearNotificationDefinitionsForTests,
  defineModuleNotifications,
  definitionsForEvent,
  getNotificationDefinition,
  isTransactionalEmailTemplate,
  listNotificationCategories,
  registerNotificationDefinitions,
} from '@/core/notifications/registry';
import { defaultNotificationCategory, notificationRow } from '@/core/notifications';
import { MODULE_NOTIFICATIONS } from '@/modules/notifications';
import { clearEmailTemplatesForTests, defineEmailTemplate, registerEmailTemplates, renderNotificationEmail, asLocale } from '@/core/notifications/email-templates';
import { emailRetryDelayMs } from '@/core/notifications/email-outbox';

afterEach(() => {
  clearNotificationDefinitionsForTests();
  clearEmailTemplatesForTests();
});

const demoTemplate = defineEmailTemplate<{ n: number }>({
  id: 'demo.b',
  parse: (d) => (typeof d.n === 'number' ? { n: d.n } : null),
  render: ({ n }) => ({ subject: `N ${n}\r\nBcc: x`, heading: 'H', greeting: 'G', body: `<b>${n}</b>`, buttonText: 'Go', buttonUrl: 'https://x.test/a', footnote: 'F' }),
});

describe('notifications registry', () => {
  it('registers module definitions and exposes categories with their channels', () => {
    registerNotificationDefinitions(defineModuleNotifications('demo', [
      { type: 'A_THING', category: 'comments', channels: ['in_app'] },
      { type: 'B_THING', category: 'billing', channels: ['in_app', 'email'], emailTemplate: 'demo.b' },
    ], [demoTemplate]));
    expect(getNotificationDefinition('demo', 'A_THING')?.module).toBe('demo');
    expect(listNotificationCategories()).toEqual([
      { category: 'comments', channels: ['in_app'] },
      { category: 'billing', channels: ['in_app', 'email'] },
    ]);
  });

  it('rejects invalid declarations', () => {
    expect(() => registerNotificationDefinitions(defineModuleNotifications('demo', [{ type: 'bad', category: 'x', channels: ['in_app'] }]))).toThrow(/Invalid/);
    expect(() => registerNotificationDefinitions(defineModuleNotifications('demo', [{ type: 'NO_CHANNEL', category: 'x', channels: [] }]))).toThrow(/no channel/);
    expect(() => registerNotificationDefinitions(defineModuleNotifications('demo', [{ type: 'MAIL', category: 'x', channels: ['email'] }]))).toThrow(/emailTemplate/);
    expect(() => registerNotificationDefinitions(defineModuleNotifications('demo', [{ type: 'EVT', category: 'x', channels: ['in_app'], event: 'demo.done' }]))).toThrow(/recipients/);
    expect(() => registerNotificationDefinitions(defineModuleNotifications('demo', [{ type: 'MAIL', category: 'x', channels: ['email'], emailTemplate: 'demo.missing' }]))).toThrow(/unknown email template/);
    expect(() => registerNotificationDefinitions({ module: 'a', definitions: [{ module: 'b', type: 'X', category: 'x', channels: ['in_app'] }] })).toThrow(/outside/);
  });

  it('declares transactional e-mails explicitly: email only, hidden from preferences, never mixed with optional', () => {
    registerNotificationDefinitions(defineModuleNotifications('demo', [
      { type: 'ALERT', category: 'billing', channels: ['in_app'] },
      { type: 'RECEIPT', category: 'billing', channels: ['email'], emailTemplate: 'demo.b', transactional: true },
    ], [demoTemplate]));
    expect(isTransactionalEmailTemplate('demo.b')).toBe(true);
    expect(isTransactionalEmailTemplate('demo.other')).toBe(false);
    expect(listNotificationCategories()).toEqual([{ category: 'billing', channels: ['in_app'] }]);
    expect(() => registerNotificationDefinitions(defineModuleNotifications('demo', [{ type: 'OPT', category: 'billing', channels: ['email'], emailTemplate: 'demo.b' }]))).toThrow(/both transactional and optional/);
    expect(() => registerNotificationDefinitions(defineModuleNotifications('demo', [{ type: 'MIXED', category: 'billing', channels: ['in_app', 'email'], emailTemplate: 'demo.b', transactional: true }]))).toThrow(/email channel only/);
    expect(() => registerNotificationDefinitions(defineModuleNotifications('demo', [{ type: 'INAPP', category: 'billing', channels: ['in_app'], transactional: true }]))).toThrow(/email channel only/);
  });

  it('indexes definitions by event', () => {
    registerNotificationDefinitions(defineModuleNotifications('demo', [
      { type: 'EVT', category: 'system', channels: ['in_app'], event: 'demo.done', recipients: () => Effect.succeed([]) },
    ]));
    expect(definitionsForEvent('demo.done').map((d) => d.type)).toEqual(['EVT']);
    expect(definitionsForEvent('demo.other')).toEqual([]);
  });

  it('every built-in module declaration is valid', () => {
    for (const entry of MODULE_NOTIFICATIONS) expect(() => registerNotificationDefinitions(entry)).not.toThrow();
  });
});

describe('notificationRow', () => {
  it('strips null data keys and derives the category like migration 0052', () => {
    expect(notificationRow({ userId: 'u', module: 'blog', type: 'NEW_REVIEW', data: { reviewId: 'r', commentId: null } })).toMatchObject({
      category: 'reviews', data: { reviewId: 'r' }, organizationId: null, dedupeKey: null,
    });
    expect(defaultNotificationCategory('SERVICE_PUBLISHED')).toBe('publishing');
    expect(defaultNotificationCategory('POST_MENTION')).toBe('mentions');
    expect(defaultNotificationCategory('NEW_COMMENT')).toBe('comments');
  });
});

describe('email templates', () => {
  it('renders escaped HTML + text with the unsubscribe link, in the locale direction', () => {
    registerEmailTemplates([demoTemplate]);
    const out = Effect.runSync(renderNotificationEmail('demo.b', { n: 3 }, { locale: 'ar', siteUrl: 'https://x.test', unsubscribeUrl: 'https://x.test/u?t=1' }));
    expect(out.subject).toBe('N 3 Bcc: x');
    expect(out.html).toContain('dir="rtl"');
    expect(out.html).toContain('&lt;b&gt;3&lt;/b&gt;');
    expect(out.html).toContain('href="https://x.test/u?t=1"');
    expect(out.text).toContain('https://x.test/u?t=1');
  });
  it('fails on unknown template or invalid data', () => {
    registerEmailTemplates([demoTemplate]);
    const tag = (e: Effect.Effect<unknown, { _tag: string }>) => Effect.runSync(Effect.flip(e))._tag;
    expect(tag(renderNotificationEmail('demo.none', {}, { locale: 'fr', siteUrl: '' }))).toBe('UnknownEmailTemplate');
    expect(tag(renderNotificationEmail('demo.b', { n: 'x' }, { locale: 'fr', siteUrl: '' }))).toBe('InvalidEmailTemplateData');
    expect(() => registerEmailTemplates([{ ...demoTemplate, id: 'Bad' }])).toThrow(/Invalid email template id/);
  });
  it('normalises locales and backs off exponentially with a cap', () => {
    expect(asLocale('es')).toBe('es');
    expect(asLocale('de')).toBe('fr');
    expect([1, 2, 3].map(emailRetryDelayMs)).toEqual([60_000, 120_000, 240_000]);
    expect(emailRetryDelayMs(30)).toBe(6 * 3_600_000);
  });
});
