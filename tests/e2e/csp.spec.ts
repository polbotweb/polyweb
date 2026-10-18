import { expect, test } from '@playwright/test';

/**
 * Régression CSP : aucune violation `securitypolicyviolation` (en particulier les
 * attributs style= bloqués par `style-src`) sur les pages publiques, et les styles
 * dynamiques (data-style) sont bien appliqués en CSSOM.
 */
const PAGES = ['/fr/', '/en/', '/fr/blog', '/fr/contact', '/fr/services'];

test.describe('CSP stricte', () => {
  for (const path of PAGES) {
    test(`aucune violation CSP sur ${path}`, async ({ page }) => {
      await page.addInitScript(() => {
        (window as unknown as { __csp: string[] }).__csp = [];
        document.addEventListener('securitypolicyviolation', (e) => {
          (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sample}`);
        });
      });
      const res = await page.goto(path, { waitUntil: 'load' });
      expect(res?.status()).toBeLessThan(400);
      await page.waitForTimeout(300);
      const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
      expect(violations).toEqual([]);
    });
  }

  test('les data-style sont appliqués par CSSOM', async ({ page }) => {
    await page.goto('/fr/', { waitUntil: 'load' });
    const total = await page.locator('[data-style]').count();
    test.skip(total === 0, 'aucun data-style sur cette page');
    const unapplied = await page.locator('[data-style]').evaluateAll((els) =>
      els.filter((el) => (el as HTMLElement).style.length === 0).length,
    );
    expect(unapplied).toBe(0);
  });
});
