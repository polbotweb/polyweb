import { describe, it, expect } from 'vitest';
import { toLocale, isRTL, getDirection } from '@/i18n/utils';

describe('toLocale', () => {
  it('returns the locale if valid', () => {
    expect(toLocale('fr')).toBe('fr');
    expect(toLocale('en')).toBe('en');
    expect(toLocale('es')).toBe('es');
    expect(toLocale('ar')).toBe('ar');
  });

  it('returns default locale for invalid input', () => {
    expect(toLocale('xx')).toBe('fr');
    expect(toLocale(undefined)).toBe('fr');
    expect(toLocale('')).toBe('fr');
  });
});

describe('isRTL', () => {
  it('returns true for Arabic', () => {
    expect(isRTL('ar')).toBe(true);
  });

  it('returns false for LTR locales', () => {
    expect(isRTL('fr')).toBe(false);
    expect(isRTL('en')).toBe(false);
    expect(isRTL('es')).toBe(false);
  });
});

describe('getDirection', () => {
  it('returns rtl for Arabic', () => {
    expect(getDirection('ar')).toBe('rtl');
  });

  it('returns ltr for other locales', () => {
    expect(getDirection('fr')).toBe('ltr');
    expect(getDirection('en')).toBe('ltr');
  });
});
