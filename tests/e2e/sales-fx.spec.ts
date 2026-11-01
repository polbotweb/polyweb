/** Back-office ventes : taux de change — forçage manuel ajouté, listé puis supprimé ; taux invalide refusé côté client. */
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

test("admin ventes : taux de change — ajout et suppression d'un forçage", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(90_000);
  const { getDrizzle } = await import("../../src/database/drizzle");
  const { exchangeRates } = await import("../../src/database/schemas/exchange-rates.schema");
  const { and, eq, isNull } = await import("drizzle-orm");
  const date = "2001-05-07";
  const cleanup = () => getDrizzle().delete(exchangeRates).where(and(isNull(exchangeRates.organizationId), eq(exchangeRates.rateDate, date)));
  try {
    await cleanup();
    await signInAsAdmin(page);
    await page.goto("/fr/admin/sales/fx", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: "Taux de change" })).toBeVisible();

    await page.getByTestId("fx-from").selectOption("GBP");
    await page.getByTestId("fx-to").selectOption("EUR");
    await page.getByTestId("fx-date").fill(date);
    await page.getByTestId("fx-rate").fill("abc");
    await page.getByTestId("fx-add").click();
    await expect(page.locator("[data-fx-rate-form] [data-form-error]")).toBeVisible();
    await expect(page.getByTestId("fx-rate")).toHaveAttribute("aria-invalid", "true");

    await page.getByTestId("fx-rate").fill("1,1675");
    await page.getByTestId("fx-add").click();
    const row = page.locator(`[data-fx-rate="GBP/EUR@${date}"]`);
    await expect(row).toContainText("1.1675");

    page.once("dialog", (dialog) => void dialog.accept());
    await row.getByTestId("fx-delete").click();
    await expect(row).toHaveCount(0);
  } finally {
    await cleanup();
  }
});
