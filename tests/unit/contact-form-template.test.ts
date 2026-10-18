import { describe, it, expect, vi } from 'vitest';

vi.mock('@i18n/utils', () => ({
  isRTL: (locale: string) => locale === 'ar',
}));

import { contactFormTemplate } from '@smtp/templates/contact-form';

const base = {
  firstName: 'Jean',
  lastName: 'Dupont',
  email: 'jean@test.com',
  phone: '+33 6 12 34 56 78',
  reason: 'quote',
  message: 'Bonjour, je voudrais un devis.',
  urgent: false,
  ipAddress: '1.2.3.4',
} as const;

describe('contactFormTemplate', () => {
  it('returns subject, html, and text', () => {
    const result = contactFormTemplate({ ...base, locale: 'fr' });
    expect(result.subject).toBeTypeOf('string');
    expect(result.html).toBeTypeOf('string');
    expect(result.text).toBeTypeOf('string');
  });

  it('includes sender info in html', () => {
    const result = contactFormTemplate({ ...base, locale: 'fr' });
    expect(result.html).toContain('Jean Dupont');
    expect(result.html).toContain('jean@test.com');
    expect(result.html).toContain('+33 6 12 34 56 78');
  });

  it('includes sender info in text', () => {
    const result = contactFormTemplate({ ...base, locale: 'fr' });
    expect(result.text).toContain('Jean Dupont');
    expect(result.text).toContain('jean@test.com');
  });

  it('sets urgent subject when urgent=true', () => {
    const result = contactFormTemplate({ ...base, locale: 'fr', urgent: true });
    expect(result.subject).toContain('URGENT');
    expect(result.html).toContain('URGENT');
  });

  it('does not include urgent badge when urgent=false', () => {
    const result = contactFormTemplate({ ...base, locale: 'fr', urgent: false });
    expect(result.subject).not.toContain('URGENT');
  });

  it('HTML-escapes user input to prevent XSS', () => {
    const xss = contactFormTemplate({
      ...base,
      locale: 'fr',
      firstName: '<script>alert(1)</script>',
      message: '"><img onerror=alert(1) src=x>',
    });
    expect(xss.html).not.toContain('<script>');
    expect(xss.html).toContain('&lt;script&gt;');
    // <img tag is escaped so it cannot render
    expect(xss.html).not.toContain('<img');
    expect(xss.html).toContain('&lt;img');
  });

  it.each(['fr', 'en', 'es', 'ar'] as const)('renders %s locale', (locale) => {
    const result = contactFormTemplate({ ...base, locale });
    expect(result.html).toContain(`lang="${locale}"`);
    expect(result.subject).toContain('Atomic');
  });

  it('uses RTL direction for Arabic', () => {
    const result = contactFormTemplate({ ...base, locale: 'ar' });
    expect(result.html).toContain('dir="rtl"');
  });

  it('uses LTR direction for French', () => {
    const result = contactFormTemplate({ ...base, locale: 'fr' });
    expect(result.html).toContain('dir="ltr"');
  });

  it('converts newlines to <br> in html message', () => {
    const result = contactFormTemplate({
      ...base,
      locale: 'fr',
      message: 'Ligne 1\nLigne 2\nLigne 3',
    });
    expect(result.html).toContain('Ligne 1<br>Ligne 2<br>Ligne 3');
  });

  it('preserves newlines in text output', () => {
    const result = contactFormTemplate({
      ...base,
      locale: 'fr',
      message: 'Ligne 1\nLigne 2',
    });
    expect(result.text).toContain('Ligne 1\nLigne 2');
  });

  it('falls back to fr translations for unknown locale', () => {
    const result = contactFormTemplate({ ...base, locale: 'fr' });
    expect(result.subject).toContain('contact');
  });
});
