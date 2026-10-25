/** Bout en bout (brique f) : lien d'aperçu signé d'un brouillon + page de différences entre révisions. */
import { test, expect } from '@playwright/test';
import { signInAsAdmin } from './helpers/admin';

test.skip(({ browserName }) => browserName !== 'chromium', 'Parcours admin : Chromium');

test('aperçu signé d’un brouillon (anonyme), lien falsifié refusé, diff des révisions', async ({ page, browser }) => {
  const slug = `prev-${Date.now().toString(36)}`;
  await signInAsAdmin(page);

  await page.goto('/fr/admin/platform/content-types/new', { waitUntil: 'networkidle' });
  await page.locator('input[name="name"]').fill('Type aperçu');
  await page.locator('input[name="slug"]').fill(slug);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status')).toContainText('Enregistré');

  await page.goto(`/fr/admin/platform/content/${slug}/new`, { waitUntil: 'networkidle' });
  await page.locator('input[name="fr__title"]').fill('Première version');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Enregistré');
  await page.locator('input[name="fr__title"]').fill('Seconde version');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Enregistré');

  await page.getByRole('button', { name: 'Créer un lien de prévisualisation' }).click();
  const href = await page.locator('[data-preview-link] a').getAttribute('href');
  expect(href).toContain('/fr/preview/');
  const previewPath = new URL(href!).pathname;

  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  const res = await anonPage.goto(previewPath);
  expect(res?.status()).toBe(200);
  expect(res?.headers()['x-robots-tag']).toContain('noindex');
  await expect(anonPage.getByRole('heading', { level: 1 })).toHaveText('Seconde version');
  await expect(anonPage.locator('[data-preview-banner]')).toContainText('Prévisualisation');
  const forged = await anonPage.goto(previewPath.slice(0, -2) + (previewPath.endsWith('AA') ? 'BB' : 'AA'));
  expect(forged?.status()).toBe(403);
  await anon.close();

  await page.getByRole('link', { name: 'Historique et différences →' }).click();
  await expect(page.getByTestId('revision-diff')).toContainText('fr.title');
  await expect(page.getByTestId('revision-diff').locator('del')).toContainText('Première');
  await expect(page.getByTestId('revision-diff').locator('ins')).toContainText('Seconde');
});
