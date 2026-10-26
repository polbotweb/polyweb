/** Back-office logistique : entrepôt et article créés via les formulaires, réception, expédition (BL, sortie de stock). */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

test("admin logistique : entrepôt, article, réception, expédition numérotée puis sortie de stock", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(120_000);
  const { getDrizzle } = await import("../../src/database/drizzle");
  const { logistics, logisticsItems, logisticsShipmentLines, logisticsStockMovements, logisticsWarehouses } = await import("../../src/database/schemas");
  const { eq, inArray } = await import("drizzle-orm");
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const code = `E2E${suffix}`;
  const sku = `SKU-${suffix}`;
  const recipient = `E2E destinataire ${suffix}`;
  try {
    await signInAsAdmin(page);
    await page.goto("/fr/admin/logistics/warehouses", { waitUntil: "networkidle" });
    await page.getByLabel("Code").fill(code.toLowerCase());
    await page.getByLabel("Nom", { exact: true }).fill(`Entrepôt ${suffix}`);
    await page.getByLabel("Pays (ISO)").fill("fr");
    await page.getByRole("button", { name: "Créer" }).click();
    await expect(page.getByTestId("logistics-warehouse-list")).toContainText(code);

    await page.goto("/fr/admin/logistics/items", { waitUntil: "networkidle" });
    await page.getByLabel("SKU").fill(sku.toLowerCase());
    await page.getByLabel("Nom", { exact: true }).fill(`Article ${suffix}`);
    await page.getByRole("button", { name: "Créer" }).click();
    await expect(page.getByTestId("logistics-item-list")).toContainText(sku);

    await page.goto("/fr/admin/logistics/stock", { waitUntil: "networkidle" });
    await page.locator("#lg-mv-warehouse").selectOption({ label: `${code} — Entrepôt ${suffix}` });
    await page.locator("#lg-mv-sku").selectOption(sku);
    await page.locator("#lg-mv-kind").selectOption("receipt");
    await page.locator("#lg-mv-qty").fill("10");
    await page.getByTestId("logistics-record").click();
    await expect(page.locator(`[data-stock-row="${code}:${sku}"] [data-level]`)).toHaveText("10");

    await page.goto("/fr/admin/logistics", { waitUntil: "networkidle" });
    await page.getByTestId("logistics-new-shipment").click();
    await page.waitForURL(/\/fr\/admin\/logistics\/new$/);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Entrepôt").selectOption({ label: `${code} — Entrepôt ${suffix}` });
    await page.getByLabel("Destinataire").fill(recipient);
    await page.getByLabel("Pays (ISO)").fill("be");
    await page.getByLabel("SKU").fill(sku);
    await page.getByLabel("Quantité").fill("3");
    await page.getByRole("button", { name: "Créer" }).click();
    await page.waitForURL(/\/fr\/admin\/logistics\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("logistics-heading")).toContainText(recipient);
    await expect(page.getByTestId("logistics-status")).toHaveText("Brouillon");
    await expect(page.getByTestId("logistics-lines")).toContainText(sku);

    await page.getByTestId("logistics-to-READY").click();
    await expect(page.getByTestId("logistics-status")).toHaveText("Prête");
    await expect(page.getByTestId("logistics-number")).not.toHaveText("—");
    await page.getByTestId("logistics-to-SHIPPED").click();
    await expect(page.getByTestId("logistics-status")).toHaveText("Expédiée");
    await expect(page.getByTestId("logistics-to-DRAFT")).toHaveCount(0);

    await page.goto("/fr/admin/logistics/stock", { waitUntil: "networkidle" });
    await expect(page.locator(`[data-stock-row="${code}:${sku}"] [data-level]`)).toHaveText("7");
  } finally {
    const db = getDrizzle();
    const warehouses = await db.select({ id: logisticsWarehouses.id }).from(logisticsWarehouses).where(eq(logisticsWarehouses.code, code));
    const ids = warehouses.map((w) => w.id);
    if (ids.length) {
      await db.delete(logisticsStockMovements).where(inArray(logisticsStockMovements.warehouseId, ids));
      const shipments = await db.select({ id: logistics.id }).from(logistics).where(inArray(logistics.warehouseId, ids));
      if (shipments.length) {
        await db.delete(logisticsShipmentLines).where(inArray(logisticsShipmentLines.shipmentId, shipments.map((s) => s.id)));
        await db.delete(logistics).where(inArray(logistics.id, shipments.map((s) => s.id)));
      }
    }
    await db.delete(logisticsItems).where(eq(logisticsItems.sku, sku));
    if (ids.length) await db.delete(logisticsWarehouses).where(inArray(logisticsWarehouses.id, ids));
  }
});
