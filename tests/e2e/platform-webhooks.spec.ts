/** Bout en bout (brique d) : création d'un webhook, garde SSRF, détail, suppression. */
import { test, expect } from '@playwright/test';
import { signInAsAdmin } from './helpers/admin';

test.skip(({ browserName }) => browserName !== 'chromium', 'Parcours admin : Chromium');

test('webhooks : SSRF refusé, création avec secret affiché une fois, suppression', async ({ page }) => {
  const name = `Hook ${Date.now().toString(36)}`;
  await signInAsAdmin(page);
  await page.goto('/fr/admin/platform/webhooks', { waitUntil: 'networkidle' });

  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="url"]').fill('http://127.0.0.1:8080/hook');
  await page.getByRole('button', { name: 'Créer le webhook' }).click();
  await expect(page.getByRole('alert')).toContainText(/HTTPS requis|IP privée|interne/);

  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="url"]').fill('https://hooks.example.invalid/polyweb');
  await page.getByRole('button', { name: 'Créer le webhook' }).click();
  await expect(page.locator('[data-secret]')).toHaveText(/^whsec_/);

  await page.getByRole('link', { name: 'Voir le webhook' }).click();
  await expect(page.getByRole('heading', { name: `Webhook : ${name}` })).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await page.waitForURL(/webhooks\?saved=deleted/);
  await expect(page.getByText(name)).toHaveCount(0);
});
