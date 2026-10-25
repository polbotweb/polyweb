import type { BrowserContext, Page } from '@playwright/test';
import { SEED_EMAIL, SEED_PASSWORD } from '../global-setup';

// better-auth limite /sign-in/email à 5 requêtes / 10 s : les specs qui se
// connectent coup sur coup recevaient un 429 et expiraient (timeout 30 s).
// On réutilise donc la session du worker et, en cas de 429, on attend la
// fenêtre avant de réessayer.
let cachedCookies: Awaited<ReturnType<BrowserContext['cookies']>> | null = null;

export async function signInAsAdmin(page: Page) {
  if (cachedCookies) {
    await page.context().addCookies(cachedCookies);
    return;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/fr/auth/connexion', { waitUntil: 'networkidle' });
    await page.locator('#sign-in-form input[name="email"]').fill(SEED_EMAIL);
    await page.locator('#sign-in-form input[name="password"]').fill(SEED_PASSWORD);
    const signIn = page.waitForResponse((r) => r.url().includes('/sign-in/email'), { timeout: 10_000 }).catch(() => null);
    await page.locator('#sign-in-btn').click();
    const response = await signIn;
    if (response?.status() === 429) {
      const retryAfter = Number(response.headers()['x-retry-after'] ?? response.headers()['retry-after'] ?? 10);
      await page.waitForTimeout(Math.min(Math.max(retryAfter, 1), 10) * 1000);
      continue;
    }
    try {
      await page.waitForURL(/tableau-de-bord|dashboard/, { timeout: 10_000 });
      await page.waitForLoadState('networkidle');
      cachedCookies = await page.context().cookies();
      return;
    } catch {
      // nouvel essai
    }
  }
  throw new Error('Sign-in failed after 3 attempts');
}
