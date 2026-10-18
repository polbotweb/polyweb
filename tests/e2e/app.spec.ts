import { test, expect } from '@playwright/test';

// ─── Public pages ───────────────────────────────────────────────────

test.describe('Homepage & i18n', () => {
  test('homepage redirects to default locale /fr/', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'networkidle' });
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/fr\/?/);
  });

  test('French page has lang="fr" and dir="ltr"', async ({ page }) => {
    const response = await page.goto('/fr/', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'fr');
    await expect(html).toHaveAttribute('dir', 'ltr');
  });

  test('English page has lang="en"', async ({ page }) => {
    const response = await page.goto('/en/', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('Arabic page has dir="rtl"', async ({ page }) => {
    const response = await page.goto('/ar/', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('navigation and footer are rendered', async ({ page }) => {
    const response = await page.goto('/fr/', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('nav').first()).toBeVisible();
    await expect(page.locator('footer').first()).toBeVisible();
  });
});

// ─── Auth — guest guards ────────────────────────────────────────────

test.describe('Auth - Guest guards', () => {
  test('sign-in page renders the login form', async ({ page }) => {
    const response = await page.goto('/fr/auth/connexion', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    // Verify actual form elements exist (not just vague text)
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    // Submit button may use a different element — check for any clickable submit
    await expect(page.locator('button[type="submit"], form button').first()).toBeVisible();
  });

  test('sign-up page renders the registration form', async ({ page }) => {
    const response = await page.goto('/fr/auth/inscription', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"], form button').first()).toBeVisible();
  });

  test('dashboard redirects unauthenticated user to sign-in', async ({ page }) => {
    await page.goto('/fr/auth/tableau-de-bord', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/connexion/);
  });

  test('profile redirects unauthenticated user to sign-in', async ({ page }) => {
    await page.goto('/fr/auth/profil', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/connexion/);
  });

  test('admin redirects unauthenticated user to sign-in', async ({ page }) => {
    await page.goto('/fr/admin/stats', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/connexion/);
  });
});

// ─── Security headers ───────────────────────────────────────────────

test.describe('Security headers', () => {
  test('responses include X-Content-Type-Options: nosniff', async ({ page }) => {
    const response = await page.goto('/fr/', { waitUntil: 'networkidle' });
    expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('responses include X-Frame-Options: DENY', async ({ page }) => {
    const response = await page.goto('/fr/', { waitUntil: 'networkidle' });
    expect(response?.headers()['x-frame-options']).toBe('DENY');
  });

  test('responses include Referrer-Policy', async ({ page }) => {
    const response = await page.goto('/fr/', { waitUntil: 'networkidle' });
    expect(response?.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('responses include Permissions-Policy', async ({ page }) => {
    const response = await page.goto('/fr/', { waitUntil: 'networkidle' });
    expect(response?.headers()['permissions-policy']).toContain('camera=()');
  });
});
