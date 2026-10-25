/**
 * Bout en bout : type de contenu défini depuis l'admin → entrée avec éditeur
 * de blocs TipTap → publication → page publique. (briques a + b)
 */
import { test, expect } from '@playwright/test';
import { signInAsAdmin } from './helpers/admin';

test.skip(({ browserName }) => browserName !== 'chromium', 'Parcours admin : Chromium');

test('crée un type, une entrée riche, publie et affiche la page publique', async ({ page }) => {
  const slug = `e2e-${Date.now().toString(36)}`;
  await signInAsAdmin(page);

  // 1. Type de contenu
  await page.goto('/fr/admin/platform/content-types/new', { waitUntil: 'networkidle' });
  await page.locator('input[name="name"]').fill('Recette E2E');
  await page.locator('input[name="slug"]').fill(slug);
  await page.getByRole('button', { name: '+ Ajouter un champ' }).click();
  const row = page.locator('[data-fields-list] > li').first();
  await row.getByLabel('Nom technique').fill('duree');
  await row.getByLabel('Libellé').fill('Durée (min)');
  await row.getByLabel('Type').selectOption('number');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status')).toContainText('Enregistré');

  // 2. Entrée avec blocs
  await page.goto(`/fr/admin/platform/content/${slug}/new`, { waitUntil: 'networkidle' });
  await page.locator('input[name="fr__title"]').fill('Tarte aux pommes');
  await page.locator('input[name="fr__duree"]').fill('45');
  const editor = page.locator('block-editor').first();
  await editor.locator('[data-blocks-add-type]').selectOption('richText');
  await editor.locator('[data-blocks-add]').click();
  const pm = editor.locator('.ProseMirror').first();
  await pm.click();
  await page.keyboard.type('Éplucher les pommes. ');
  await editor.getByRole('button', { name: 'Gras' }).click();
  await page.keyboard.type('Important');
  await editor.locator('[data-blocks-add-type]').selectOption('callout');
  await editor.locator('[data-blocks-add]').click();
  await editor.locator('li').nth(1).locator('textarea').fill('Four à 180 °C');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status')).toContainText('Enregistré');

  // 3. Publication
  await page.getByRole('button', { name: 'Publier' }).click();
  await expect(page.getByRole('status')).toContainText('Publié');

  // 4. Page publique
  await page.goto(`/fr/c/${slug}/tarte-aux-pommes`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1')).toHaveText('Tarte aux pommes');
  await expect(page.locator('.pw-richtext strong')).toHaveText('Important');
  await expect(page.locator('.pw-callout')).toHaveText('Four à 180 °C');
  await expect(page.locator('dd')).toContainText('45');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).toContain('"@type":"Article"');
});
