/** Back-office achats : page de réglages configurable et liste des factures. */
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

test("admin achats : réglages et factures accessibles", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(90_000);
  await signInAsAdmin(page);
  await page.goto("/fr/admin/purchasing/settings", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Réglages" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ajouter un palier" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Réglages" })).toBeVisible();
  await expect(page.getByText("Modèles d'e-mail")).toBeVisible();
  await page.locator("select[name=reorderMode]").selectOption("suggestions");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator("select[name=reorderMode]")).toHaveValue("suggestions");

  await page.goto("/fr/admin/purchasing/invoices", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Factures fournisseur" })).toBeVisible();
  await page.goto("/fr/admin/purchasing/reorder", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Réassort", exact: true })).toBeVisible();
});
