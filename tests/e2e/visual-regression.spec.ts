/**
 * Régression visuelle (reprise d'antx `e2e-tests/visual-regression.spec.ts`,
 * adaptée aux routes polyweb). Chromium uniquement : les rendus de polices
 * diffèrent entre moteurs.
 *
 * Première exécution / mise à jour des références :
 *   pnpm test:visual --update-snapshots
 * Les références sont stockées dans tests/e2e/visual-regression.spec.ts-snapshots/.
 */
import { test, expect } from '@playwright/test';

test.skip(({ browserName }) => browserName !== 'chromium', 'Snapshots visuels : Chromium uniquement');

const SHOTS: Array<{ name: string; path: string; viewport?: { width: number; height: number } }> = [
  { name: 'home-fr', path: '/fr/' },
  { name: 'home-ar-rtl', path: '/ar/' },
  { name: 'login-fr', path: '/fr/auth/connexion' },
  { name: 'signup-fr', path: '/fr/auth/inscription' },
  { name: 'home-fr-mobile', path: '/fr/', viewport: { width: 390, height: 844 } },
];

test.beforeEach(async ({ page }) => {
  // Bandeau cookies masqué : consentement pré-enregistré (format de CookieConsent.astro).
  await page.addInitScript(() => {
    localStorage.setItem('cookie-consent', JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: Date.now() }));
  });
  // Ressources externes neutralisées pour des captures déterministes (comme antx).
  await page.route(/\.(woff2?|ttf)$/, (route) => route.fulfill({ status: 200, body: '', contentType: 'font/woff2' }));
});

for (const shot of SHOTS) {
  test(`visual: ${shot.name}`, async ({ page }) => {
    if (shot.viewport) await page.setViewportSize(shot.viewport);
    await page.goto(shot.path, { waitUntil: 'networkidle' });
    await expect(page).toHaveScreenshot(`${shot.name}.png`, {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
      // Les dates / compteurs dynamiques sont masqués.
      mask: [page.locator('time'), page.locator('[data-dynamic]')],
    });
  });
}
