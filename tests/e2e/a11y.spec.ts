/**
 * Audit d'accessibilité automatisé avec axe-core (idée reprise d'antx
 * `e2e-tests/accessibility-responsive.spec.ts`, réécrit pour @axe-core/playwright).
 * Échoue sur toute violation WCAG 2.1 A/AA de sévérité "serious" ou "critical".
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  '/fr/',
  '/en/',
  '/ar/',
  '/fr/blog',
  '/fr/contact',
  '/fr/auth/connexion',
  '/fr/auth/inscription',
];

for (const path of PAGES) {
  test(`axe: ${path} sans violation grave`, async ({ page }) => {
    // Les animations d'entrée (opacity) faussent la mesure de contraste : on les neutralise.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path, { waitUntil: 'networkidle' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} nœud(s) — ${v.help} — ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")}: ${n.failureSummary?.split("\n").slice(1, 2).join("")}`).join(" | ")}`);
    expect(summary, summary.join('\n')).toEqual([]);
  });
}
