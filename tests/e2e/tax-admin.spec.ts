/** Back-office TVA : création d'un taux via le formulaire, affichage dans la liste, édition. */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

test("admin TVA : créer puis modifier un taux", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  const { getDrizzle, schema } = await import("../../src/database/drizzle");
  const { eq } = await import("drizzle-orm");
  const slug = `e2e-tva-${randomUUID().slice(0, 8)}`;
  try {
    await signInAsAdmin(page);
    await page.goto("/fr/admin/tax", { waitUntil: "networkidle" });
    await page.getByTestId("tax-new").click();
    await page.waitForURL(/\/fr\/admin\/tax\/new$/);
    await page.getByLabel("Libellé").fill(`E2E ${slug}`);
    await page.getByLabel("Identifiant").fill(slug);
    await page.getByLabel("Pays (code ISO)").fill("cy");
    await page.getByLabel("Taux (%)").fill("9,5");
    await page.getByLabel("Catégorie").selectOption("reduced");
    await page.getByLabel("Type de client").selectOption("B2B");
    await page.getByRole("button", { name: "Créer le taux" }).click();
    await page.waitForURL(/\/fr\/admin\/tax$/);
    const row = page.getByTestId("tax-rate-list").locator("li", { hasText: slug });
    await expect(row).toContainText("CY");
    await expect(row).toContainText("9,5");
    await expect(row).toContainText("Actif");

    await row.getByRole("link", { name: /Modifier/ }).click();
    await page.waitForURL(/\/edit$/);
    await page.getByLabel("Taux (%)").fill("8");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForURL(/\/fr\/admin\/tax$/);
    await expect(page.getByTestId("tax-rate-list").locator("li", { hasText: slug })).toContainText("8");
    const [saved] = await getDrizzle().select().from(schema.tax).where(eq(schema.tax.slug, slug));
    expect(saved?.ratePercent).toBe("8.0000");
    expect(saved?.countryCode).toBe("CY");
  } finally {
    await getDrizzle().delete(schema.tax).where(eq(schema.tax.slug, slug));
  }
});
