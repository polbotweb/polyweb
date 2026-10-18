import { test, expect } from '@playwright/test';
import { SEED_EMAIL, SEED_PASSWORD, SEED_NAME } from './global-setup';

/**
 * E2E tests for auth flows.
 *
 * global-setup.ts seeds a verified user (SEED_EMAIL / SEED_PASSWORD).
 * This lets us test real sign-in → dashboard flows.
 *
 * A fresh unverified user is also created during sign-up tests to verify
 * that requireEmailVerification blocks unverified accounts.
 */

const FRESH_PASSWORD = 'E2eTest1234!';
const FRESH_NAME = 'E2E Tester';

function createFreshEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function fillOptionalUsername(page: import('@playwright/test').Page) {
  const usernameField = page.locator('input[name="username"]');
  if (await usernameField.isVisible({ timeout: 500 }).catch(() => false)) {
    await usernameField.fill(`e2etester${Date.now()}`);
  }
}

async function signUp(page: import('@playwright/test').Page, email: string) {
  const response = await page.goto('/fr/auth/inscription', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);

  await page.locator('input[name="name"]').fill(FRESH_NAME);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(FRESH_PASSWORD);
  await fillOptionalUsername(page);

  const submitBtn = page.locator('button[type="submit"], form button').first();
  await Promise.all([
    page.waitForURL(/connexion|sign-in/, { timeout: 30000 }),
    submitBtn.click(),
  ]);
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/connexion|sign-in/);
}

/** Sign in as seed user — reliable across browsers (Chromium, Firefox, WebKit). */
async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/fr/auth/connexion', { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').fill(SEED_EMAIL);
  await page.locator('input[name="password"]').fill(SEED_PASSWORD);
  const submitBtn = page.locator('button[type="submit"], form button').first();
  await Promise.all([
    page.waitForURL(/tableau-de-bord|dashboard/, { timeout: 30000 }),
    submitBtn.click(),
  ]);
  await page.waitForLoadState('networkidle');
}

// ─── Sign-up form flow ──────────────────────────────────────────────

test.describe('Sign-up flow', () => {
  test('sign-up form submits and redirects to sign-in page', async ({ page }) => {
    await signUp(page, createFreshEmail());
  });

  test('sign-in form rejects unverified email', async ({ page }) => {
    const freshEmail = createFreshEmail();
    await signUp(page, freshEmail);

    await page.locator('input[name="email"]').fill(freshEmail);
    await page.locator('input[name="password"]').fill(FRESH_PASSWORD);
    await page.locator('button[type="submit"], form button').first().click();

    // Unverified email — should stay on sign-in with an error
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/connexion|sign-in/);
  });
});

// ─── Authenticated flow (uses verified seed user) ──────────────────

test.describe('Authenticated flow', () => {
  test('verified user can sign in and reach dashboard', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/tableau-de-bord|dashboard/);
  });

  test('authenticated user can access profile page', async ({ page }) => {
    await signIn(page);

    // Navigate to profile
    const response = await page.goto('/fr/auth/profil', { waitUntil: 'networkidle' });
    expect(response?.ok()).toBeTruthy();

    // Verify user info is displayed
    const body = await page.textContent('body');
    expect(body).toContain(SEED_NAME);
    expect(body).toContain(SEED_EMAIL);
  });
});

// ─── Enter key form submission ──────────────────────────────────────

test.describe('Enter key submission', () => {
  test('sign-in form submits on Enter key', async ({ page }) => {
    await page.goto('/fr/auth/connexion', { waitUntil: 'networkidle' });
    await page.locator('input[name="email"]').fill(SEED_EMAIL);
    await page.locator('input[name="password"]').fill(SEED_PASSWORD);

    // Press Enter instead of clicking the button
    await Promise.all([
      page.waitForURL(/tableau-de-bord|dashboard/, { timeout: 30000 }),
      page.locator('input[name="password"]').press('Enter'),
    ]);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/tableau-de-bord|dashboard/);
  });

  test('sign-up form submits on Enter key', async ({ page }) => {
    const freshEmail = createFreshEmail();
    await page.goto('/fr/auth/inscription', { waitUntil: 'networkidle' });

    await page.locator('input[name="name"]').fill(FRESH_NAME);
    await fillOptionalUsername(page);
    await page.locator('input[name="email"]').fill(freshEmail);
    await page.locator('input[name="password"]').fill(FRESH_PASSWORD);

    // Press Enter instead of clicking the button
    await Promise.all([
      page.waitForURL(/connexion|sign-in/, { timeout: 30000 }),
      page.locator('input[name="password"]').press('Enter'),
    ]);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/connexion|sign-in/);
  });

  test('forgot-password form submits on Enter key', async ({ page }) => {
    await page.goto('/fr/auth/mot-de-passe-oublie', { waitUntil: 'networkidle' });
    await page.locator('input[name="email"], input[type="email"]').first().fill(SEED_EMAIL);

    // Press Enter — should show success message (always shows success even if email unknown)
    await page.locator('input[name="email"], input[type="email"]').first().press('Enter');
    await page.waitForTimeout(3000);

    // The success block should become visible or the form should be hidden
    const successVisible = await page.locator('#forgot-password-success').isVisible().catch(() => false);
    const formHidden = await page.locator('#forgot-password-form').isHidden().catch(() => false);
    expect(successVisible || formHidden).toBeTruthy();
  });
});

// ─── Auth guards (unauthenticated) ─────────────────────────────────

test.describe('Auth guards', () => {
  test('organisations page redirects to sign-in', async ({ page }) => {
    const response = await page.goto('/fr/auth/organisations', { waitUntil: 'networkidle' });
    // After redirect chain, final page should be 200
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/connexion|sign-in/);
  });

  test('verify-email page is accessible without auth', async ({ page }) => {
    const response = await page.goto('/fr/auth/verifier-email', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page).not.toHaveURL(/connexion|sign-in/);
  });

  test('reset-password page is accessible without auth', async ({ page }) => {
    const response = await page.goto('/fr/auth/reinitialiser-mot-de-passe', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page).not.toHaveURL(/connexion|sign-in/);
  });
});

// ─── Public pages smoke tests ───────────────────────────────────────

test.describe('Public pages', () => {
  test('about page loads', async ({ page }) => {
    const response = await page.goto('/fr/a-propos', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"], article').first()).toBeVisible();
  });

  test('contact page loads', async ({ page }) => {
    const response = await page.goto('/fr/contact', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"], article').first()).toBeVisible();
  });

  test('legal page loads', async ({ page }) => {
    const response = await page.goto('/fr/mentions-legales', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('main, [role="main"], article').first()).toBeVisible();
  });

  test('forgot password page loads', async ({ page }) => {
    const response = await page.goto('/fr/auth/mot-de-passe-oublie', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible();
  });

  test('Spanish locale loads correctly', async ({ page }) => {
    const response = await page.goto('/es/', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });
});
