/**
 * Régression visuelle (reprise d'antx `e2e-tests/visual-regression.spec.ts`,
 * adaptée aux routes polyweb). Chromium uniquement : les rendus de polices
 * diffèrent entre moteurs.
 *
 * Première exécution / mise à jour des références :
 *   pnpm test:visual --update-snapshots
 * Les références sont stockées dans tests/e2e/visual-regression.spec.ts-snapshots/.
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * Diagnostic joint au rapport (aucune assertion) : styles calculés, polices système réellement
 * utilisées (CDP CSS.getPlatformFontsForNode) et hauteurs des sections — permet de comparer
 * l'environnement CI à celui qui a produit les références sans deviner.
 */
async function renderMetrics(page: Page) {
  const selectors = ['body', 'header nav a', 'h1', 'main p', 'footer'];
  const styles = await page.evaluate((sels) => sels.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const cs = getComputedStyle(el);
    return { sel, fontFamily: cs.fontFamily, fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontWeight: cs.fontWeight, height: (el as HTMLElement).offsetHeight };
  }), selectors);
  const sections = await page.evaluate(() => [...document.querySelectorAll('body > *, main > *')].map((el) => ({
    tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') ?? '').slice(0, 60), height: (el as HTMLElement).offsetHeight,
  })));
  const platformFonts: Record<string, unknown> = {};
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    for (const sel of selectors) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
      if (!nodeId) continue;
      // Les polices se lisent sur le nœud texte : premier descendant texte.
      const { node } = await cdp.send('DOM.describeNode', { nodeId, depth: 3 });
      const findText = (n: { nodeType: number; backendNodeId: number; children?: unknown[] }): number | undefined =>
        n.nodeType === 3 ? n.backendNodeId : (n.children as typeof n[] | undefined)?.map(findText).find(Boolean);
      const textBackend = findText(node as never);
      const target = textBackend
        ? (await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [textBackend] })).nodeIds[0]
        : nodeId;
      platformFonts[sel] = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId: target })).fonts;
    }
  } catch (e) { platformFonts.error = String(e); }
  return { userAgent: await page.evaluate(() => navigator.userAgent), styles, platformFonts, sections, scrollHeight: await page.evaluate(() => document.documentElement.scrollHeight) };
}

/** Familles disponibles sur le runner CI et en local (latin : Liberation Sans ; arabe : DejaVu Sans). */
const PINNED_FONTS_CSS = `html, body, body * { font-family: "Liberation Sans", "DejaVu Sans", sans-serif !important; }`;

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
  // Polices système figées : la pile du thème (-apple-system, …, Roboto, "Noto Sans", Arial…) se résout
  // selon les polices installées — Roboto sur le poste qui avait produit les références, Liberation Sans
  // sur le runner CI (pas de Roboto) → +20/36 px de hauteur (prouvé par render-metrics, cf. ci-dessous).
  // On impose les familles présentes dans les deux environnements (Playwright --with-deps installe
  // fonts-liberation + DejaVu) en complétant les feuilles /_astro/*.css (pas de <style> inline : CSP
  // stricte ; /theme.css n'est pas toujours servi — absent sans thème actif, cas de la base de test).
  await page.route(/\/_astro\/[^?]*\.css(\?|$)/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n${PINNED_FONTS_CSS}` });
  });
});

for (const shot of SHOTS) {
  test(`visual: ${shot.name}`, async ({ page }, testInfo) => {
    if (shot.viewport) await page.setViewportSize(shot.viewport);
    await page.goto(shot.path, { waitUntil: 'networkidle' });
    await testInfo.attach(`${shot.name}-render-metrics.json`, { body: JSON.stringify(await renderMetrics(page), null, 2), contentType: 'application/json' });
    await expect(page).toHaveScreenshot(`${shot.name}.png`, {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
      // Les dates / compteurs dynamiques sont masqués.
      mask: [page.locator('time'), page.locator('[data-dynamic]')],
    });
  });
}
