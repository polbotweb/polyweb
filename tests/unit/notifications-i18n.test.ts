import { describe, expect, it } from 'vitest';
import { LOCALES } from '@i18n/config';
import { categoryLabel, fill, getNotificationsTranslations, notificationLabel } from '@/core/notifications/i18n';
import { notificationsPath } from '@/core/notifications/pages';

const shape = (value: unknown): unknown =>
  value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]).sort()) : typeof value;

describe('notifications i18n', () => {
  it('has the same non-empty keys in the 4 locales', () => {
    const reference = shape(getNotificationsTranslations('fr'));
    for (const locale of LOCALES) {
      const t = getNotificationsTranslations(locale);
      expect(shape(t)).toEqual(reference);
      for (const text of JSON.stringify(t).match(/"[^"]*"/g) ?? []) expect(text).not.toBe('""');
    }
  });
  it('fills placeholders and falls back to the raw category', () => {
    const t = getNotificationsTranslations('en');
    expect(fill(t.unreadCount, { count: 3 })).toBe('3 unread');
    expect(fill('{a} {b}', { a: 1 })).toBe('1 {b}');
    expect(categoryLabel(t, 'billing')).toBe('Billing');
    expect(categoryLabel(t, 'custom')).toBe('custom');
  });
  it('labels a notification from its type, then its title, then its category', () => {
    const t = getNotificationsTranslations('en');
    expect(notificationLabel(t, { module: 'sales', type: 'INVOICE_REMINDER_SENT', category: 'billing', data: { number: 'FA-1', level: 2, daysOverdue: 16, nested: { x: 1 } } }))
      .toBe('Reminder #2 sent for invoice FA-1 (16 days overdue)');
    expect(notificationLabel(t, { module: 'blog', type: 'NEW_COMMENT', category: 'comments', title: 'Stored title' })).toBe('Stored title');
    expect(notificationLabel(t, { module: 'blog', type: 'NEW_COMMENT', category: 'comments', title: null })).toBe('Comments');
  });
  it('builds list URLs with filter and page', () => {
    expect(notificationsPath('fr')).toBe('/fr/notifications');
    expect(notificationsPath('en', { unread: true, page: 3 })).toBe('/en/notifications?filter=unread&page=3');
    expect(notificationsPath('ar', { page: 1 })).toBe('/ar/notifications');
  });
});
