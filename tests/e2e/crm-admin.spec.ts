/** Back-office CRM : société et opportunité créées via les formulaires, pipeline avancé, activité, gain. */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

test("admin CRM : société, opportunité, étapes, activité puis gain", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(90_000);
  const { getDrizzle } = await import("../../src/database/drizzle");
  const { crm, crmCompanies } = await import("../../src/database/schemas");
  const { eq } = await import("drizzle-orm");
  const suffix = randomUUID().slice(0, 8);
  const companyName = `E2E société ${suffix}`;
  const title = `E2E opportunité ${suffix}`;
  try {
    await signInAsAdmin(page);
    await page.goto("/fr/admin/crm/companies", { waitUntil: "networkidle" });
    await page.getByTestId("crm-new-company").click();
    await page.waitForURL(/\/fr\/admin\/crm\/companies\/new$/);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Nom", { exact: true }).fill(companyName);
    await page.getByLabel("Pays (ISO)").fill("fr");
    await page.getByRole("button", { name: "Créer" }).click();
    await page.waitForURL(/\/fr\/admin\/crm\/companies\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("crm-heading")).toHaveText(companyName);
    await expect(page.getByText("FR", { exact: true })).toBeVisible();

    await page.goto("/fr/admin/crm", { waitUntil: "networkidle" });
    await page.getByTestId("crm-new-opportunity").click();
    await page.waitForURL(/\/fr\/admin\/crm\/new$/);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Intitulé").fill(title);
    await page.getByLabel("Société").selectOption({ label: companyName });
    await page.getByLabel("Montant").fill("1500");
    await page.getByRole("button", { name: "Créer" }).click();
    await page.waitForURL(/\/fr\/admin\/crm\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("crm-heading")).toHaveText(title);
    await expect(page.getByTestId("crm-status")).toHaveText("Nouvelle");
    await expect(page.getByRole("link", { name: companyName })).toBeVisible();

    await page.getByTestId("crm-to-QUALIFIED").click();
    await expect(page.getByTestId("crm-status")).toHaveText("Qualifiée");
    await page.getByTestId("crm-to-PROPOSAL").click();
    await expect(page.getByTestId("crm-status")).toHaveText("Proposition");

    await page.getByLabel("Objet").fill("Appel de suivi");
    await page.getByRole("button", { name: "Ajouter une activité" }).click();
    await expect(page.getByTestId("crm-activities")).toContainText("Appel de suivi");

    await page.getByTestId("crm-to-WON").click();
    await expect(page.getByTestId("crm-status")).toHaveText("Gagnée");
    await expect(page.getByText("Opportunité clôturée")).toBeVisible();
    await expect(page.getByTestId("crm-to-LOST")).toHaveCount(0);
  } finally {
    const db = getDrizzle();
    await db.delete(crm).where(eq(crm.title, title));
    await db.delete(crmCompanies).where(eq(crmCompanies.name, companyName));
  }
});

test("admin CRM : opportunité perdue avec motif puis rouverte", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  const { getDrizzle } = await import("../../src/database/drizzle");
  const { crm } = await import("../../src/database/schemas");
  const { eq } = await import("drizzle-orm");
  const db = getDrizzle();
  const suffix = randomUUID().slice(0, 8);
  const [row] = await db.insert(crm).values({ slug: `e2e-perte-${suffix}`, title: `E2E perte ${suffix}`, status: "QUALIFIED", amountMinor: 50000, currency: "EUR" }).returning({ id: crm.id });
  try {
    await signInAsAdmin(page);
    await page.goto(`/fr/admin/crm/${row!.id}`, { waitUntil: "networkidle" });
    await page.getByLabel("Motif de perte").selectOption("price");
    await page.getByTestId("crm-to-LOST").click();
    await expect(page.getByTestId("crm-status")).toHaveText("Perdue");
    await expect(page.getByText("Prix", { exact: true })).toBeVisible();
    await page.getByTestId("crm-to-QUALIFIED").click();
    await expect(page.getByTestId("crm-status")).toHaveText("Qualifiée");
  } finally {
    await db.delete(crm).where(eq(crm.id, row!.id));
  }
});
