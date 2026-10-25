/** Bout en bout (brique i) : activation d'un plugin, réglages validés, désactivation. */
import { test, expect } from '@playwright/test';
import { signInAsAdmin } from './helpers/admin';

test.skip(({ browserName }) => browserName !== 'chromium', 'Parcours admin : Chromium');

test('plugins : activer le bloc FAQ, refuser des réglages invalides, désactiver', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/fr/admin/platform/plugins', { waitUntil: 'networkidle' });
  const faq = page.locator('[data-plugin="faq-block"]');
  if ((await faq.getByRole('button', { name: 'Désactiver' }).count()) > 0) {
    await faq.getByRole('button', { name: 'Désactiver' }).click();
    await page.waitForURL(/saved=disable/);
  }
  await faq.getByRole('button', { name: 'Activer' }).click();
  await page.waitForURL(/saved=enable/);
  await expect(page.getByRole('status')).toHaveText('Plugin activé.');
  await expect(faq).toContainText('actif');

  const auto = page.locator('[data-plugin="form-autoreply"]');
  await auto.locator('summary').click();
  await auto.locator('input[name="emailField"]').fill('Bad Field!');
  await auto.getByRole('button', { name: 'Enregistrer les réglages' }).click();
  await expect(page.locator('[data-plugin="form-autoreply"] [role="alert"]')).toContainText('emailField');

  await page.locator('[data-plugin="faq-block"]').getByRole('button', { name: 'Désactiver' }).click();
  await page.waitForURL(/saved=disable/);
  await expect(page.locator('[data-plugin="faq-block"]')).toContainText('inactif');
});
