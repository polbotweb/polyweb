/**
 * Bout en bout (brique c) : création d'un jeton dans l'admin puis appels réels
 * à l'API REST v1 (lecture, écriture, OpenAPI) avec ce jeton.
 */
import { test, expect } from '@playwright/test';
import { signInAsAdmin } from './helpers/admin';

test.skip(({ browserName }) => browserName !== 'chromium', 'Parcours admin : Chromium');

test('jeton d’API créé dans l’admin → CRUD via /api/v1', async ({ page, request }) => {
  const typeSlug = `api-${Date.now().toString(36)}`;
  await signInAsAdmin(page);

  await page.goto('/fr/admin/platform/content-types/new', { waitUntil: 'networkidle' });
  await page.locator('input[name="name"]').fill('Type API');
  await page.locator('input[name="slug"]').fill(typeSlug);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status')).toContainText('Enregistré');

  await page.goto('/fr/admin/platform/api-tokens', { waitUntil: 'networkidle' });
  const tokenName = `E2E ${typeSlug}`;
  await page.locator('input[name="name"]').fill(tokenName);
  await page.locator('input[name="scopes"][value="content:write"]').check();
  await page.getByRole('button', { name: 'Créer le jeton' }).click();
  const token = (await page.locator('[data-token]').textContent())?.trim() ?? '';
  expect(token).toMatch(/^pw_[A-Za-z0-9]{8}_/);

  const auth = { authorization: `Bearer ${token}` };
  const created = await request.post(`/api/v1/content/${typeSlug}`, {
    headers: auth,
    data: { slug: 'premier', status: 'published', translations: { fr: { title: 'Premier' } } },
  });
  expect(created.status()).toBe(201);

  const listed = await request.get(`/api/v1/content/${typeSlug}?locale=fr`);
  expect(listed.status()).toBe(200);
  const body = await listed.json();
  expect(body.data[0]).toMatchObject({ slug: 'premier', title: 'Premier' });

  expect((await request.post(`/api/v1/content/${typeSlug}`, { data: { translations: { fr: { title: 'x' } } } })).status()).toBe(401);

  const spec = await (await request.get('/api/v1/openapi.json')).json();
  expect(spec.paths[`/content/${typeSlug}`]).toBeDefined();

  expect((await request.delete(`/api/v1/content/${typeSlug}/premier`, { headers: auth })).status()).toBe(204);

  // Révocation depuis l'admin → 401
  await page.goto('/fr/admin/platform/api-tokens', { waitUntil: 'networkidle' });
  await page.locator('tr', { hasText: tokenName }).getByRole('button', { name: 'Révoquer' }).click();
  await expect(page.getByRole('status')).toContainText('révoqué');
  expect((await request.get('/api/v1/content-types', { headers: auth })).status()).toBe(401);
});
