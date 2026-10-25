/** Bout en bout (brique g) : création d'un formulaire, soumission publique, liste des soumissions, export CSV. */
import { test, expect } from '@playwright/test';
import { signInAsAdmin } from './helpers/admin';

test.skip(({ browserName }) => browserName !== 'chromium', 'Parcours admin : Chromium');

test('formulaires : création, soumission publique sans JS, soumissions et export CSV', async ({ page }) => {
  const slug = `contact-${Date.now().toString(36)}`;
  await signInAsAdmin(page);
  await page.goto('/fr/admin/platform/forms', { waitUntil: 'networkidle' });
  await page.locator('input[name="name"]').fill('Contact E2E');
  await page.locator('input[name="slug"]').fill(slug);
  await page.getByRole('button', { name: 'Créer le formulaire' }).click();
  await expect(page.getByRole('status')).toContainText('Formulaire créé');
  const editUrl = page.url().replace(/\?.*$/, '');

  await page.goto(`/fr/f/${slug}`);
  await expect(page.getByRole('heading', { name: 'Contact E2E' })).toBeVisible();
  // erreur de validation serveur (validation HTML5 désactivée pour le test) conservant la saisie
  await page.locator('form:has(input[name="_ts"])').evaluate((f) => ((f as HTMLFormElement).noValidate = true));
  await page.locator('input[name="f__email"]').fill('pas-un-email');
  await page.locator('textarea[name="f__message"]').fill('Bonjour depuis Playwright');
  await page.waitForTimeout(2_200); // délai « humain » exigé par le jeton _ts
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole('alert').filter({ hasText: 'invalides' })).toBeVisible();
  await expect(page.locator('textarea[name="f__message"]')).toHaveValue('Bonjour depuis Playwright');
  await page.locator('input[name="f__email"]').fill('visiteur@example.test');
  await page.waitForTimeout(2_200);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/sent=1/);
  await expect(page.getByRole('status')).toContainText('Merci');

  await page.goto(`${editUrl}/submissions`);
  await expect(page.getByTestId('submissions')).toContainText('visiteur@example.test');
  await expect(page.getByTestId('submissions')).toContainText('nouveau');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Exporter en CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(new RegExp(`^${slug}-\\d{4}-\\d{2}-\\d{2}\\.csv$`));

  await page.goto(editUrl);
  page.once('dialog', (d) => d.accept());
  await page.locator('button[name="intent"][value="delete"]').click();
  await page.waitForURL(/\/admin\/platform\/forms$/);
  await expect(page.getByText(slug)).toHaveCount(0);
});
