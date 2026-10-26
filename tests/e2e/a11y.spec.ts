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

test('axe: /fr/admin/tax et /fr/admin/tax/new sans violation grave, titres et cibles', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Parcours admin : Chromium');
  await signInAsAdmin(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of ['/fr/admin/tax', '/fr/admin/tax/new']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${path} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    const structure = await structureViolations(page);
    expect([...serious, ...structure], [...serious, ...structure].join('\n')).toEqual([]);
  }
});

test('axe: /fr/admin/sales (liste, nouveau, détail) sans violation grave, titres et cibles', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Parcours admin : Chromium');
  const { getDrizzle } = await import('../../src/database/drizzle');
  const { sales, salesDocumentLines } = await import('../../src/database/schemas');
  const { eq } = await import('drizzle-orm');
  const db = getDrizzle();
  // Facture émise (détail avec transitions, encaissement et relance) insérée directement.
  const suffix = Date.now().toString(36);
  const [doc] = await db.insert(sales).values({
    kind: 'invoice', slug: `a11y-${suffix}`, title: `A11y vente ${suffix}`, status: 'ISSUED', number: `A11Y-${suffix}`,
    customerName: 'Client A11y', customerCountry: 'FR', customerType: 'B2C', sellerCountry: 'FR', currency: 'EUR',
    issueDate: '2026-10-01', dueDate: '2026-10-31', netMinor: 10000, taxMinor: 2000, grossMinor: 12000,
  }).returning({ id: sales.id });
  await db.insert(salesDocumentLines).values({ documentId: doc!.id, position: 1, description: 'Prestation', quantity: '1', unitPriceMinor: 10000, ratePercent: '20', netMinor: 10000 });
  try {
    await signInAsAdmin(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const path of ['/fr/admin/sales', '/fr/admin/sales/new?kind=invoice', `/fr/admin/sales/${doc!.id}`, `/ar/admin/sales/${doc!.id}`, '/ar/admin/sales']) {
      await page.goto(path, { waitUntil: 'networkidle' });
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${path} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      const structure = await structureViolations(page);
      expect([...serious, ...structure], [...serious, ...structure].join('\n')).toEqual([]);
    }
  } finally {
    await db.delete(sales).where(eq(sales.id, doc!.id));
  }
});

test('axe: /fr/admin/crm (pipeline, fiches, formulaires) sans violation grave, titres et cibles', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Parcours admin : Chromium');
  const { getDrizzle } = await import('../../src/database/drizzle');
  const { crm, crmActivities, crmCompanies, crmContacts } = await import('../../src/database/schemas');
  const { eq } = await import('drizzle-orm');
  const db = getDrizzle();
  // Société, contact, opportunité ouverte et activité insérés directement.
  const suffix = Date.now().toString(36);
  const [company] = await db.insert(crmCompanies).values({ name: `A11y société ${suffix}`, country: 'FR' }).returning({ id: crmCompanies.id });
  const [contact] = await db.insert(crmContacts).values({ companyId: company!.id, firstName: 'Ada', lastName: `A11y ${suffix}`, dedupKey: `a11y-${suffix}` }).returning({ id: crmContacts.id });
  const [opp] = await db.insert(crm).values({ slug: `a11y-${suffix}`, title: `A11y opportunité ${suffix}`, status: 'PROPOSAL', companyId: company!.id, contactId: contact!.id, amountMinor: 250000, currency: 'EUR' }).returning({ id: crm.id });
  await db.insert(crmActivities).values({ opportunityId: opp!.id, kind: 'call', subject: 'Appel A11y' });
  try {
    await signInAsAdmin(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const paths = ['/fr/admin/crm', '/fr/admin/crm/new', `/fr/admin/crm/${opp!.id}`, `/fr/admin/crm/${opp!.id}/edit`, '/fr/admin/crm/companies', `/fr/admin/crm/companies/${company!.id}`, '/fr/admin/crm/contacts/new', `/fr/admin/crm/contacts/${contact!.id}`, `/ar/admin/crm/${opp!.id}`, '/ar/admin/crm'];
    for (const path of paths) {
      await page.goto(path, { waitUntil: 'networkidle' });
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${path} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      const structure = await structureViolations(page);
      expect([...serious, ...structure], [...serious, ...structure].join('\n')).toEqual([]);
    }
  } finally {
    await db.delete(crm).where(eq(crm.id, opp!.id));
    await db.delete(crmCompanies).where(eq(crmCompanies.id, company!.id));
    await db.delete(crmContacts).where(eq(crmContacts.id, contact!.id));
  }
});

/**
 * WCAG 2.5.5 (AAA, approuvé) : les commandes icônes de l'admin navigation font
 * au moins 44 × 44 px (axe ne vérifie que le seuil AA de 24 px).
 */
test('admin navigation : commandes icônes ≥ 44 × 44 px (WCAG 2.5.5)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Parcours admin : Chromium');
  await signInAsAdmin(page);
  await page.goto('/fr/admin/navigation', { waitUntil: 'networkidle' });
  const selector = '.menu-edit-btn, .menu-delete-btn, .nav-move-up, .nav-move-down, .nav-delete-btn, .locale-tab-btn';
  const sizes = await page.locator(selector).evaluateAll((els) =>
    els
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0)
      .map(({ el, r }) => ({ cls: el.className.split(' ')[0], w: Math.round(r.width), h: Math.round(r.height) })),
  );
  expect(sizes.length).toBeGreaterThan(0);
  const tooSmall = sizes.filter((s) => s.h < 44 || s.w < 44);
  expect(tooSmall, JSON.stringify(tooSmall.slice(0, 5))).toEqual([]);
});
