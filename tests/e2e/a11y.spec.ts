/**
 * Audit d'accessibilité automatisé avec axe-core (idée reprise d'antx
 * `e2e-tests/accessibility-responsive.spec.ts`, réécrit pour @axe-core/playwright).
 * Échoue sur toute violation WCAG 2.1 A/AA de sévérité "serious" ou "critical".
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signInAsAdmin } from './helpers/admin';

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

/**
 * Régressions ciblées (relevées par Lighthouse) : ordre des titres sans saut de
 * niveau et taille minimale des cibles (WCAG 2.2 — 2.5.8, ≥ 24 px). Toute
 * violation, quelle que soit sa sévérité, fait échouer.
 */
const STRUCTURE_RULES = ['heading-order', 'target-size'];

async function structureViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).withRules(STRUCTURE_RULES).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const path of ['/fr/blog', '/en/blog', '/fr/']) {
  test(`axe: ${path} titres ordonnés et cibles ≥ 24 px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path, { waitUntil: 'networkidle' });
    const violations = await structureViolations(page);
    expect(violations, violations.join('\n')).toEqual([]);
  });
}

test('axe: /fr/admin/navigation cibles ≥ 24 px (boutons monter/descendre)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Parcours admin : Chromium');
  await signInAsAdmin(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/fr/admin/navigation', { waitUntil: 'networkidle' });
  const violations = await structureViolations(page);
  expect(violations, violations.join('\n')).toEqual([]);
});
