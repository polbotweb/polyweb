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

test('axe: /fr/admin/logistics (expéditions, entrepôts, articles, stock) sans violation grave, titres et cibles', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Parcours admin : Chromium');
  const { getDrizzle } = await import('../../src/database/drizzle');
  const { logistics, logisticsItems, logisticsShipmentLines, logisticsStockMovements, logisticsWarehouses } = await import('../../src/database/schemas');
  const { eq } = await import('drizzle-orm');
  const db = getDrizzle();
  // Entrepôts, article, stock et expédition brouillon insérés directement.
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  const [wh] = await db.insert(logisticsWarehouses).values({ code: `A11Y${suffix}`, name: `A11y entrepôt ${suffix}`, country: 'FR' }).returning({ id: logisticsWarehouses.id });
  const [wh2] = await db.insert(logisticsWarehouses).values({ code: `A11YB${suffix}`, name: `A11y entrepôt B ${suffix}` }).returning({ id: logisticsWarehouses.id });
  const [item] = await db.insert(logisticsItems).values({ sku: `A11Y-${suffix}`, name: `A11y article ${suffix}` }).returning({ id: logisticsItems.id });
  await db.insert(logisticsStockMovements).values({ warehouseId: wh!.id, itemId: item!.id, kind: 'receipt', delta: 5 });
  const [shipment] = await db.insert(logistics).values({ slug: `a11y-${suffix.toLowerCase()}`, title: `A11y expédition ${suffix}`, status: 'DRAFT', warehouseId: wh!.id, recipientName: 'Ada A11y', country: 'FR' }).returning({ id: logistics.id });
  await db.insert(logisticsShipmentLines).values({ shipmentId: shipment!.id, position: 0, itemId: item!.id, sku: `A11Y-${suffix}`, quantity: 2 });
  try {
    await signInAsAdmin(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const paths = ['/fr/admin/logistics', '/fr/admin/logistics/new', `/fr/admin/logistics/${shipment!.id}`, `/fr/admin/logistics/${shipment!.id}/edit`, '/fr/admin/logistics/warehouses', `/fr/admin/logistics/warehouses/${wh!.id}`, '/fr/admin/logistics/items', `/fr/admin/logistics/items/${item!.id}`, '/fr/admin/logistics/stock', `/ar/admin/logistics/${shipment!.id}`, '/ar/admin/logistics/stock'];
    for (const path of paths) {
      await page.goto(path, { waitUntil: 'networkidle' });
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${path} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      const structure = await structureViolations(page);
      expect([...serious, ...structure], [...serious, ...structure].join('\n')).toEqual([]);
    }
  } finally {
    await db.delete(logisticsShipmentLines).where(eq(logisticsShipmentLines.shipmentId, shipment!.id));
    await db.delete(logistics).where(eq(logistics.id, shipment!.id));
    await db.delete(logisticsStockMovements).where(eq(logisticsStockMovements.itemId, item!.id));
    await db.delete(logisticsItems).where(eq(logisticsItems.id, item!.id));
    await db.delete(logisticsWarehouses).where(eq(logisticsWarehouses.id, wh!.id));
    await db.delete(logisticsWarehouses).where(eq(logisticsWarehouses.id, wh2!.id));
  }
});

test('axe: /fr/admin/purchasing (commandes, fournisseurs, réceptions) sans violation grave, titres et cibles', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Parcours admin : Chromium');
  const { getDrizzle } = await import('../../src/database/drizzle');
  const { logisticsItems, logisticsWarehouses, purchasing, purchasingOrderLines, purchasingSuppliers } = await import('../../src/database/schemas');
  const { eq } = await import('drizzle-orm');
  const db = getDrizzle();
  // Fournisseur, entrepôt, article et commandes (brouillon + envoyée, réceptionnable) insérés directement.
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  const [wh] = await db.insert(logisticsWarehouses).values({ code: `A11YP${suffix}`, name: `A11y entrepôt achats ${suffix}` }).returning({ id: logisticsWarehouses.id });
  const [item] = await db.insert(logisticsItems).values({ sku: `A11YP-${suffix}`, name: `A11y article achats ${suffix}` }).returning({ id: logisticsItems.id });
  const [supplier] = await db.insert(purchasingSuppliers).values({ code: `A11Y${suffix}`, name: `A11y fournisseur ${suffix}`, country: 'FR' }).returning({ id: purchasingSuppliers.id });
  const [draft] = await db.insert(purchasing).values({ slug: `a11y-po-${suffix.toLowerCase()}`, title: `A11y commande ${suffix}`, status: 'DRAFT', supplierId: supplier!.id, warehouseId: wh!.id, netMinor: 2000 }).returning({ id: purchasing.id });
  const [sent] = await db.insert(purchasing).values({ slug: `a11y-po2-${suffix.toLowerCase()}`, title: `A11y commande envoyée ${suffix}`, number: `A11Y-BC-${suffix}`, status: 'SENT', supplierId: supplier!.id, warehouseId: wh!.id, netMinor: 2000, sentAt: new Date() }).returning({ id: purchasing.id });
  for (const order of [draft!, sent!]) await db.insert(purchasingOrderLines).values({ orderId: order.id, position: 0, itemId: item!.id, sku: `A11YP-${suffix}`, quantity: 2, unitPriceMinor: 1000, netMinor: 2000 });
  try {
    await signInAsAdmin(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const paths = ['/fr/admin/purchasing', '/fr/admin/purchasing/new', `/fr/admin/purchasing/${draft!.id}`, `/fr/admin/purchasing/${draft!.id}/edit`, `/fr/admin/purchasing/${sent!.id}`, '/fr/admin/purchasing/suppliers', `/fr/admin/purchasing/suppliers/${supplier!.id}`, '/fr/admin/purchasing/receipts', `/ar/admin/purchasing/${sent!.id}`];
    for (const path of paths) {
      await page.goto(path, { waitUntil: 'networkidle' });
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${path} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      const structure = await structureViolations(page);
      expect([...serious, ...structure], [...serious, ...structure].join('\n')).toEqual([]);
    }
  } finally {
    await db.delete(purchasing).where(eq(purchasing.supplierId, supplier!.id));
    await db.delete(purchasingSuppliers).where(eq(purchasingSuppliers.id, supplier!.id));
    await db.delete(logisticsItems).where(eq(logisticsItems.id, item!.id));
    await db.delete(logisticsWarehouses).where(eq(logisticsWarehouses.id, wh!.id));
  }
});

test('axe: /fr/admin/bookings (réservations, ressources, disponibilités) sans violation grave, titres et cibles', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Parcours admin : Chromium');
  const { getDrizzle } = await import('../../src/database/drizzle');
  const { bookings, bookingsResources } = await import('../../src/database/schemas');
  const { eq } = await import('drizzle-orm');
  const db = getDrizzle();
  // Ressource (toute la semaine 08–20 UTC) et réservations (demandée + confirmée) insérées directement.
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  const windows = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }));
  const [resource] = await db.insert(bookingsResources).values({ code: `A11Y${suffix}`, name: `A11y salle ${suffix}`, capacity: 4, timezone: 'UTC', slotMinutes: 60, windows }).returning({ id: bookingsResources.id });
  const start = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 11, 9));
  const [requested] = await db.insert(bookings).values({ slug: `a11y-bk-${suffix.toLowerCase()}`, title: `A11y réservation ${suffix}`, status: 'REQUESTED', resourceId: resource!.id, startsAt: start, endsAt: new Date(start.getTime() + 3_600_000), customerName: `A11y client ${suffix}` }).returning({ id: bookings.id });
  const [confirmed] = await db.insert(bookings).values({ slug: `a11y-bk2-${suffix.toLowerCase()}`, title: `A11y réservation confirmée ${suffix}`, number: `A11Y-RES-${suffix}`, status: 'CONFIRMED', resourceId: resource!.id, startsAt: new Date(start.getTime() + 7_200_000), endsAt: new Date(start.getTime() + 10_800_000), customerName: `A11y client 2 ${suffix}`, confirmedAt: new Date() }).returning({ id: bookings.id });
  try {
    await signInAsAdmin(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const day = start.toISOString().slice(0, 10);
    const paths = ['/fr/admin/bookings', '/fr/admin/bookings/new', `/fr/admin/bookings/${requested!.id}`, `/fr/admin/bookings/${requested!.id}/edit`, `/fr/admin/bookings/${confirmed!.id}`, '/fr/admin/bookings/resources', `/fr/admin/bookings/resources/${resource!.id}?date=${day}`, `/ar/admin/bookings/${confirmed!.id}`, `/ar/admin/bookings/resources/${resource!.id}?date=${day}`];
    for (const path of paths) {
      await page.goto(path, { waitUntil: 'networkidle' });
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${path} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      const structure = await structureViolations(page);
      expect([...serious, ...structure], [...serious, ...structure].join('\n')).toEqual([]);
    }
  } finally {
    await db.delete(bookings).where(eq(bookings.resourceId, resource!.id));
    await db.delete(bookingsResources).where(eq(bookingsResources.id, resource!.id));
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
