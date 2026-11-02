import { describe, expect, it } from 'vitest';
import { LOCALES } from '@i18n/config';
import { categoryLabel, fill, getNotificationsTranslations } from '@/core/notifications/i18n';

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
});
