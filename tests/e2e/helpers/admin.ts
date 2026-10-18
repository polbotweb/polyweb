import type { Page } from '@playwright/test';
import { SEED_EMAIL, SEED_PASSWORD } from '../global-setup';

export async function signInAsAdmin(page: Page) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/fr/auth/connexion', { waitUntil: 'networkidle' });
    await page.locator('#sign-in-form input[name="email"]').fill(SEED_EMAIL);
    await page.locator('#sign-in-form input[name="password"]').fill(SEED_PASSWORD);
    try {
      await Promise.all([page.waitForURL(/tableau-de-bord|dashboard/, { timeout: 30000 }), page.locator('#sign-in-btn').click()]);
      await page.waitForLoadState('networkidle');
      return;
    } catch {
      if (attempt === 1) throw new Error('Sign-in failed after 2 attempts');
    }
  }
}
