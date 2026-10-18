import { test, expect } from '@playwright/test';
import { SEED_EMAIL, SEED_PASSWORD } from './global-setup';

/**
 * E2E tests for CMS admin pages (site, navigation, theme).
 *
 * The seed user is set as admin in global-setup.ts so these pages
 * are accessible after sign-in.
 */

/** Sign in as admin seed user — reliable across browsers. */
async function signInAsAdmin(page: import('@playwright/test').Page) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/fr/auth/connexion', { waitUntil: 'networkidle' });
    await page.locator('input[name="email"]').fill(SEED_EMAIL);
    await page.locator('input[name="password"]').fill(SEED_PASSWORD);
    const submitBtn = page.locator('button[type="submit"], form button').first();
    try {
      await Promise.all([
        page.waitForURL(/tableau-de-bord|dashboard/, { timeout: 30000 }),
        submitBtn.click(),
      ]);
      await page.waitForLoadState('networkidle');
      return;
    } catch {
      if (attempt === 1) throw new Error('Sign-in failed after 2 attempts');
    }
  }
}

// ─── Admin access guard ─────────────────────────────────────────────

test.describe('CMS Admin access', () => {
  test('unauthenticated user is redirected from admin pages', async ({ page }) => {
    await page.goto('/fr/admin/site');
    await expect(page).toHaveURL(/connexion|sign-in/);
  });
});

// ─── Site settings page ─────────────────────────────────────────────

test.describe('CMS Site settings page', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test('site page loads successfully', async ({ page }) => {
    const response = await page.goto('/fr/admin/site');
    expect(response?.ok()).toBeTruthy();
    expect(response?.status()).toBe(200);
  });

  test('site page contains settings form', async ({ page }) => {
    await page.goto('/fr/admin/site');
    // Forms are inside JS-activated tab panels — verify they exist in the DOM
    await expect(page.locator('form').first()).toBeAttached({ timeout: 10000 });
  });

  test('site page has tabs for settings and hours', async ({ page }) => {
    await page.goto('/fr/admin/site');
    // Look for tab-like elements with role or data-attributes
    const tabs = page.locator('[role="tab"], [data-tab], button:has-text("Heures"), button:has-text("Contact"), button:has-text("Social"), a[role="tab"]');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ─── Navigation page ────────────────────────────────────────────────

test.describe('CMS Navigation page', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test('navigation page loads successfully', async ({ page }) => {
    const response = await page.goto('/fr/admin/navigation');
    expect(response?.ok()).toBeTruthy();
    expect(response?.status()).toBe(200);
  });

  test('navigation page contains management UI', async ({ page }) => {
    await page.goto('/fr/admin/navigation');
    // Navigation uses JS-driven inline editing, not traditional forms
    await expect(page.locator('#cms-nav-data').first()).toBeVisible({ timeout: 10000 });
  });
});

// ─── Theme page ─────────────────────────────────────────────────────

test.describe('CMS Theme page', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test('theme page loads successfully', async ({ page }) => {
    const response = await page.goto('/fr/admin/theme');
    expect(response?.ok()).toBeTruthy();
    expect(response?.status()).toBe(200);
  });

  test('theme page contains form', async ({ page }) => {
    await page.goto('/fr/admin/theme');
    await expect(page.locator('form').first()).toBeVisible({ timeout: 10000 });
  });
});
