/** Back-office tableau de bord ERP : accès, filtres GET, erreurs de saisie, section stock. */
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

test("admin tableau de bord : indicateurs, périodes trimestrielles, stock et filtres invalides", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(60_000);
  await signInAsAdmin(page);

  const response = await page.goto("/fr/admin/dashboard?from=2026-01-01&to=2026-06-30&granularity=quarter&currency=EUR", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByTestId("dashboard-summary")).toBeVisible();
  await expect(page.getByTestId("kpi-revenue-net")).toContainText("€");
  await expect(page.getByTestId("dashboard-periods").locator("tbody tr")).toHaveCount(2);
  await expect(page.getByTestId("dashboard-stock")).toBeVisible();
  await expect(page.getByTestId("dashboard-errors")).toHaveCount(0);
  await expect(page.locator('a[href="/fr/admin/dashboard"]').first()).toBeAttached();

  await page.goto("/fr/admin/dashboard?from=2026-02-30&currency=ZZZ&threshold=-1", { waitUntil: "networkidle" });
  await expect(page.getByTestId("dashboard-errors").locator("li")).toHaveCount(3);
  await expect(page.getByTestId("dashboard-summary")).toBeVisible();
});

test("tableau de bord : non connecté → pas de données", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  const anonymous = await page.request.get("/fr/admin/dashboard", { maxRedirects: 0 });
  expect([401, 302, 303]).toContain(anonymous.status());
});
