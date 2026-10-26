/** Back-office Ventes : facture créée via le formulaire, émise, encaissée, puis PDF téléchargé. */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

test("admin ventes : créer, émettre, encaisser une facture et télécharger le PDF", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(90_000);
  const { getDrizzle } = await import("../../src/database/drizzle");
  const { sales, salesPayments } = await import("../../src/database/schemas");
  const { eq, inArray } = await import("drizzle-orm");
  const title = `E2E vente ${randomUUID().slice(0, 8)}`;
  try {
    await signInAsAdmin(page);
    await page.goto("/fr/admin/sales", { waitUntil: "networkidle" });
    await page.getByTestId("sales-new-invoice").click();
    await page.waitForURL(/\/fr\/admin\/sales\/new\?kind=invoice$/);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Objet").fill(title);
    await page.getByLabel("Client", { exact: true }).fill("ACME E2E");
    await page.getByLabel("Désignation").fill("Audit");
    await page.getByLabel("Quantité").fill("2");
    await page.getByLabel("Prix unitaire HT").fill("50");
    await page.getByRole("button", { name: "Créer le brouillon" }).click();
    await page.waitForURL(/\/fr\/admin\/sales\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("sales-heading")).toContainText("Brouillon");
    await expect(page.getByTestId("sales-gross")).toContainText("120,00");

    await page.getByRole("button", { name: "Émettre" }).click();
    await expect(page.getByTestId("sales-status")).toHaveText("Émise");
    await expect(page.getByTestId("sales-heading")).toContainText(/FA-\d{4}-\d{5}/);
    await expect(page.getByTestId("sales-due")).toContainText("120,00");

    await page.getByRole("button", { name: "Enregistrer l'encaissement" }).click();
    await expect(page.getByTestId("sales-status")).toHaveText("Payée");
    await expect(page.getByTestId("sales-due")).toContainText("0,00");

    const href = await page.getByTestId("sales-pdf").getAttribute("href");
    expect(href).toMatch(/\/fr\/admin\/sales\/[0-9a-f-]{36}\/pdf$/);
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect(response.headers()["content-disposition"]).toMatch(/attachment; filename="invoice-FA-\d{4}-\d{5}\.pdf"/);
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  } finally {
    const db = getDrizzle();
    const rows = await db.select({ id: sales.id }).from(sales).where(eq(sales.title, title));
    const ids = rows.map((row) => row.id);
    if (ids.length) {
      await db.delete(salesPayments).where(inArray(salesPayments.documentId, ids));
      await db.delete(sales).where(inArray(sales.id, ids));
    }
  }
});

test("route PDF : non connecté → refus, document inconnu → 404", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  const anonymous = await page.request.get("/fr/admin/sales/00000000-0000-4000-8000-000000000000/pdf", { maxRedirects: 0 });
  expect([401, 302, 303]).toContain(anonymous.status());
  expect(anonymous.headers()["content-type"] ?? "").not.toContain("application/pdf");
  await signInAsAdmin(page);
  const missing = await page.request.get("/fr/admin/sales/00000000-0000-4000-8000-000000000000/pdf");
  expect(missing.status()).toBe(404);
});
