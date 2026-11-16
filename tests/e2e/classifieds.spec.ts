/**
 * Petites annonces : réglages d'administration, dépôt d'une recherche (wanted) sans photo,
 * apparition dans le tableau public et dans « Mes annonces ».
 */
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

test("classifieds : réglages → dépôt d'annonce → liste publique et mes annonces", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(150_000);
  const stamp = Date.now().toString(36);
  const title = `E2E don ${stamp}`;
  await signInAsAdmin(page);
  await page.goto("/fr/admin/classifieds", { waitUntil: "networkidle" });
  await expect(page.getByTestId("admin-classifieds")).toBeVisible();
  await page.getByLabel("Pré-modération", { exact: false }).uncheck();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("classifieds-notice")).toHaveText("Modifications enregistrées.");

  await page.goto("/fr/classifieds/new", { waitUntil: "networkidle" });
  await expect(page.getByTestId("classifieds-new")).toBeVisible();
  const pick = page.locator("#pick-category");
  const option = pick.locator("option").filter({ hasText: "Dons" });
  const value = await option.getAttribute("value");
  expect(value).toBeTruthy();
  await page.goto(`/fr/classifieds/new?categoryId=${value}`, { waitUntil: "networkidle" });
  const form = page.getByTestId("classifieds-form");
  await form.locator("select[name=categoryId]").selectOption(value!);
  await form.getByLabel("Titre", { exact: true }).fill(title);
  await form.getByLabel("Description", { exact: true }).fill("Je cherche un vélo pour un test E2E polyweb.");
  await form.locator("select[name=kind]").selectOption("wanted");
  await form.locator("select[name=priceKind]").selectOption("free");
  await form.getByLabel("Ville", { exact: true }).fill("Nantes");
  await page.getByRole("button", { name: "Publier" }).click();
  await page.waitForURL(/\/classifieds\/a\/.+\?notice=/);
  await expect(page.getByTestId("classifieds-notice")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);

  await page.goto(`/fr/classifieds?q=${encodeURIComponent(title)}`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("classifieds-index")).toBeVisible();
  await expect(page.getByTestId("classifieds-card")).toContainText(title);

  await page.goto("/fr/classifieds/mine", { waitUntil: "networkidle" });
  await expect(page.getByTestId("classifieds-mine")).toContainText(title);
});
