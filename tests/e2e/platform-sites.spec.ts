/** Bout en bout (brique j) : création d'un site, bascule du site administré, suppression. */
import { test, expect } from '@playwright/test';
import { signInAsAdmin } from './helpers/admin';

test.skip(({ browserName }) => browserName !== 'chromium', 'Parcours admin : Chromium');

test('sites : créer, administrer, isoler les formulaires, supprimer', async ({ page }) => {
  const slug = `e2e-${Date.now().toString(36)}`;
  await signInAsAdmin(page);
  await page.goto('/fr/admin/platform/sites', { waitUntil: 'networkidle' });
  await page.locator('input[name="name"]').fill(`Site ${slug}`);
  await page.locator('input[name="slug"]').fill(slug);
  await page.locator('input[name="domains"]').fill(`${slug}.example.test`);
  await page.getByRole('button', { name: 'Créer le site' }).click();
  await expect(page.getByRole('status')).toHaveText('Site créé.');

  const row = page.locator(`tr[data-site="${slug}"]`);
  await row.getByRole('button', { name: 'Administrer' }).click();
  await expect(page.getByRole('status')).toContainText(`Site ${slug}`);
  await expect(page.locator(`[data-admin-site="${slug}"]`)).toBeVisible();

  // Les écrans plateforme portent sur ce site : aucun formulaire n'y existe.
  await page.goto('/fr/admin/platform/forms');
  await expect(page.locator(`[data-admin-site="${slug}"]`)).toBeVisible();
  await expect(page.getByText('Aucun formulaire.')).toBeVisible();

  await page.goto('/fr/admin/platform/sites');
  await page.locator(`tr[data-site="${slug}"]`).getByRole('link', { name: 'Modifier' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Supprimer le site' }).click();
  await page.waitForURL(/saved=deleted/);
  await expect(page.locator(`tr[data-site="${slug}"]`)).toHaveCount(0);
  await expect(page.locator('[data-admin-site="default"]')).toBeVisible();
});
