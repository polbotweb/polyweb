/** Bout en bout (brique k) : API de recherche v1. */
import { test, expect } from '@playwright/test';

test.skip(({ browserName }) => browserName !== 'chromium', 'API : Chromium seulement');

test('GET /api/v1/search : validation et réponse JSON', async ({ request }) => {
  const bad = await request.get('/api/v1/search?q=a');
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toBe('ValidationError');
  const ok = await request.get('/api/v1/search?q=bonjour&locale=fr&kind=content,page');
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body).toMatchObject({ query: 'bonjour', locale: 'fr', driver: 'postgres' });
  expect(Array.isArray(body.results)).toBe(true);
  const bearer = await request.get('/api/v1/search?q=bonjour', { headers: { authorization: 'Bearer pw_invalid_token' } });
  expect(bearer.status()).toBe(401);
});
