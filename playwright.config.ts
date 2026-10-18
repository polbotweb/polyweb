import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Retry flaky runs: 2 in CI (matches CI job), 1 locally.
  retries: process.env.CI ? 2 : 1,
  // A single Node SSR preview server backs ALL projects (chromium/firefox/webkit).
  // Running workers in parallel across 3 browsers overloads that server and causes
  // intermittent `SSL connect error` / `NS_ERROR_CONNECTION_REFUSED` / "Sign-in
  // failed". Sequential execution (1 worker) keeps the server responsive and makes
  // E2E deterministic — this is Playwright's own CI recommendation for SSR apps.
  // CI already runs with 1; we mirror it locally for the same stability guarantee.
  workers: 1,
  reporter: [
    // open:'never' so the HTML reporter does NOT spawn a blocking server on
    // port 9323 waiting for Ctrl+C — it would hang the whole `pnpm qa` pipeline.
    ['html', { outputFolder: 'tests/reports/playwright', open: 'never' }],
    ['json', { outputFile: 'tests/reports/playwright-results.json' }],
  ],
  use: {
    baseURL: 'http://localhost:4322',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'pnpm run build && pnpm preview --host localhost --port 4322',
    url: 'http://localhost:4322',
    // Always start a FRESH server built from the current source. Reusing a
    // pre-existing preview (e.g. one started manually in another terminal)
    // is unsafe: it may serve a stale build (so E2E would not exercise the
    // latest code) and a long-lived dev preview tends to become unstable under
    // the E2E request load, producing intermittent `SSL connect error` /
    // `NS_ERROR_CONNECTION_REFUSED`. CI already uses false; we mirror it locally
    // for the same determinism. Ensure port 4322 is free before running.
    reuseExistingServer: false,
    timeout: 180_000,
    env: { NODE_ENV: 'test' },
  },
});
