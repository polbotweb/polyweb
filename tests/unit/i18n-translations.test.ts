import { describe, it, expect } from 'vitest';
import {
  getHomeTranslations,
  getAboutTranslations,
  getContactTranslations,
} from '@i18n/utils';
import { LOCALES, type Locale } from '@i18n/config';

const locales: Locale[] = [...LOCALES];

describe('getHomeTranslations', () => {
  it.each(locales)('loads %s and has required keys', async (locale) => {
    const t = await getHomeTranslations(locale);
    expect(t.hero).toBeDefined();
    expect(t.hero.title).toBeTypeOf('string');
    expect(t.hero.description).toBeTypeOf('string');
    expect(t.logos).toBeInstanceOf(Array);
    expect(t.pillars).toBeDefined();
    expect(t.pillars.items.length).toBeGreaterThan(0);
    expect(t.testimonials).toBeDefined();
    expect(t.testimonials.items.length).toBeGreaterThan(0);
    expect(t.pricing).toBeDefined();
    expect(t.pricing.plans.length).toBeGreaterThan(0);
    expect(t.ctaBanner).toBeDefined();
  });
});

describe('getAboutTranslations', () => {
  it.each(locales)('loads %s and has required keys', async (locale) => {
    const t = await getAboutTranslations(locale);
    expect(t.meta).toBeDefined();
    expect(t.meta.title).toBeTypeOf('string');
    expect(t.hero).toBeDefined();
    expect(t.hero.title).toBeTypeOf('string');
    expect(t.mission).toBeDefined();
    expect(t.mission.cards.length).toBeGreaterThan(0);
    expect(t.values).toBeDefined();
    expect(t.values.items.length).toBeGreaterThan(0);
    expect(t.team).toBeDefined();
    expect(t.team.members.length).toBeGreaterThan(0);
    expect(t.cta).toBeDefined();
  });
});

describe('getContactTranslations', () => {
  it.each(locales)('loads %s and has required keys', async (locale) => {
    const t = await getContactTranslations(locale);
    expect(t.meta).toBeDefined();
    expect(t.meta.title).toBeTypeOf('string');
    expect(t.badge).toBeTypeOf('string');
    expect(t.heading).toBeTypeOf('string');
    expect(t.reasons).toBeInstanceOf(Array);
    expect(t.reasons.length).toBeGreaterThan(0);
    expect(t.form).toBeDefined();
    expect(t.form.heading).toBeTypeOf('string');
    expect(t.form.submit).toBeTypeOf('string');
    // feedback keys used by ContactPage data attributes
    expect(t.feedback).toBeDefined();
    expect(t.feedback.success).toBeTypeOf('string');
    expect(t.feedback.error).toBeTypeOf('string');
    expect(t.feedback.networkError).toBeTypeOf('string');
    expect(t.feedback.rateLimited).toBeTypeOf('string');
  });
});
