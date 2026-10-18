import { describe, it, expect, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { consentSettings } from '@database/schemas';
import { getConsentSettings } from '@database/loaders/consent.loader';
import { LOCALES } from '@i18n/config';

/**
 * Integration tests for CMS-driven cookie consent settings.
 * Verifies seed data, loader behaviour, and CRUD operations.
 */

const db = getDrizzle();

const expectedPrivacyUrls: Record<string, string> = {
  fr: '/fr/mentions-legales',
  en: '/en/legal-notice',
  es: '/es/aviso-legal',
  ar: '/ar/الشروط-القانونية',
};

// ─── Seed data presence ──────────────────────────────────────────────

describe('Consent CMS — Seed data', () => {
  it('has exactly 4 consent rows (one per locale)', async () => {
    const rows = await db
      .select({ id: consentSettings.id, locale: consentSettings.locale })
      .from(consentSettings);

    expect(rows).toHaveLength(4);
    const locales = rows.map((r) => r.locale).sort();
    expect(locales).toEqual([...LOCALES].sort());
  });

  it.each([...LOCALES])('locale %s has all required text fields populated', async (locale) => {
    const [row] = await db
      .select()
      .from(consentSettings)
      .where(eq(consentSettings.locale, locale))
      .limit(1);

    expect(row).toBeDefined();

    // Banner content
    expect(row.title).toBeTypeOf('string');
    expect(row.title.length).toBeGreaterThan(0);
    expect(row.description).toBeTypeOf('string');
    expect(row.description.length).toBeGreaterThan(0);

    // Button labels
    expect(row.acceptAll.length).toBeGreaterThan(0);
    expect(row.rejectAll.length).toBeGreaterThan(0);
    expect(row.customize.length).toBeGreaterThan(0);
    expect(row.savePreferences.length).toBeGreaterThan(0);

    // Cookie category labels + descriptions
    expect(row.necessaryLabel.length).toBeGreaterThan(0);
    expect(row.necessaryDescription.length).toBeGreaterThan(0);
    expect(row.analyticsLabel.length).toBeGreaterThan(0);
    expect(row.analyticsDescription.length).toBeGreaterThan(0);
    expect(row.marketingLabel.length).toBeGreaterThan(0);
    expect(row.marketingDescription.length).toBeGreaterThan(0);

    // Privacy link
    expect(row.privacyPolicyLabel.length).toBeGreaterThan(0);
  });

  it.each([...LOCALES])('locale %s has correct privacy policy URL', async (locale) => {
    const [row] = await db
      .select({ privacyPolicyUrl: consentSettings.privacyPolicyUrl })
      .from(consentSettings)
      .where(eq(consentSettings.locale, locale))
      .limit(1);

    expect(row.privacyPolicyUrl).toBe(expectedPrivacyUrls[locale]);
  });

  it.each([...LOCALES])('locale %s has isActive=true', async (locale) => {
    const [row] = await db
      .select({ isActive: consentSettings.isActive })
      .from(consentSettings)
      .where(eq(consentSettings.locale, locale))
      .limit(1);

    expect(row.isActive).toBe(true);
  });
});

// ─── Loader ──────────────────────────────────────────────────────────

describe('Consent CMS — getConsentSettings loader', () => {
  it.each([...LOCALES])('returns consent data for %s', async (locale) => {
    const result = await getConsentSettings(locale);

    expect(result).not.toBeNull();
    expect(result!.locale).toBe(locale);
    expect(result!.title).toBeTypeOf('string');
    expect(result!.isActive).toBe(true);
  });

  it('returns correct FR content', async () => {
    const result = await getConsentSettings('fr');

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Nous respectons votre vie privée');
    expect(result!.acceptAll).toBe('Tout accepter');
    expect(result!.rejectAll).toBe('Tout refuser');
    expect(result!.customize).toBe('Personnaliser');
    expect(result!.necessaryLabel).toBe('Cookies nécessaires');
    expect(result!.analyticsLabel).toBe('Cookies analytiques');
    expect(result!.marketingLabel).toBe('Cookies marketing');
  });

  it('returns correct EN content', async () => {
    const result = await getConsentSettings('en');

    expect(result).not.toBeNull();
    expect(result!.title).toBe('We respect your privacy');
    expect(result!.acceptAll).toBe('Accept all');
    expect(result!.rejectAll).toBe('Reject all');
  });

  it('returns null for invalid locale', async () => {
    const result = await getConsentSettings('zz');
    expect(result).toBeNull();
  });

  it('returns null for empty string', async () => {
    const result = await getConsentSettings('');
    expect(result).toBeNull();
  });
});

// ─── CRUD operations ─────────────────────────────────────────────────

describe('Consent CMS — DB operations', () => {
  const testLocale = `test-${Date.now()}`;
  let testId: string;

  afterAll(async () => {
    if (testId) {
      try {
        await db.delete(consentSettings).where(eq(consentSettings.id, testId));
      } catch { /* already cleaned */ }
    }
  });

  it('inserts a new consent row', async () => {
    const [created] = await db
      .insert(consentSettings)
      .values({
        locale: testLocale,
        title: 'Test title',
        description: 'Test description',
        acceptAll: 'Accept',
        rejectAll: 'Reject',
        customize: 'Customize',
        savePreferences: 'Save',
        necessaryLabel: 'Necessary',
        necessaryDescription: 'Required cookies',
        analyticsLabel: 'Analytics',
        analyticsDescription: 'Tracking cookies',
        marketingLabel: 'Marketing',
        marketingDescription: 'Ad cookies',
        privacyPolicyLabel: 'Privacy',
        privacyPolicyUrl: '/test/privacy',
        isActive: false,
      })
      .returning();

    expect(created).toBeDefined();
    expect(created.locale).toBe(testLocale);
    expect(created.isActive).toBe(false);
    expect(created.id).toBeTypeOf('string');
    testId = created.id;
  });

  it('updates a consent row', async () => {
    const [updated] = await db
      .update(consentSettings)
      .set({ title: 'Updated title', isActive: true })
      .where(eq(consentSettings.id, testId))
      .returning();

    expect(updated.title).toBe('Updated title');
    expect(updated.isActive).toBe(true);
  });

  it('enforces unique locale constraint', async () => {
    await expect(
      db.insert(consentSettings).values({
        locale: testLocale,
        title: 'Duplicate',
        description: 'Dup',
        acceptAll: 'A',
        rejectAll: 'R',
        customize: 'C',
        savePreferences: 'S',
        necessaryLabel: 'N',
        necessaryDescription: 'ND',
        analyticsLabel: 'An',
        analyticsDescription: 'AD',
        marketingLabel: 'M',
        marketingDescription: 'MD',
        privacyPolicyLabel: 'P',
      }),
    ).rejects.toThrow();
  });

  it('deletes a consent row', async () => {
    const [deleted] = await db
      .delete(consentSettings)
      .where(eq(consentSettings.id, testId))
      .returning({ id: consentSettings.id });

    expect(deleted.id).toBe(testId);
    testId = ''; // prevent afterAll double-delete
  });
});
