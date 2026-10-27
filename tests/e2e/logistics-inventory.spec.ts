/** Back-office logistique : inventaire ouvert depuis l'admin, comptage saisi, validation (ajustement d'écart) visible au grand livre et au stock. */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { SEED_EMAIL } from "./global-setup";
import { signInAsAdmin } from "./helpers/admin";

test("admin logistique : inventaire — ouverture, comptage, validation puis écart au grand livre", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(120_000);
  const { getDrizzle, schema } = await import("../../src/database/drizzle");
  const { logisticsInventoryCounts, logisticsItems, logisticsStockMovements, logisticsWarehouses } = await import("../../src/database/schemas");
  const { Effect } = await import("effect");
  const { logisticsService } = await import("../../src/modules/logistics/services/logistics.service");
  const { eq, inArray } = await import("drizzle-orm");
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const code = `E2EI${suffix}`;
  const sku = `INV-${suffix}`;
  try {
    const [admin] = await getDrizzle().select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, SEED_EMAIL)).limit(1);
    const warehouse = await Effect.runPromise(logisticsService.createWarehouse({ organizationId: null, code, name: `Inventaire ${suffix}` }));
    await Effect.runPromise(logisticsService.createItem({ organizationId: null, sku, name: `Article ${suffix}` }));
    await Effect.runPromise(logisticsService.recordMovement({ organizationId: null, warehouseId: warehouse.id, sku, kind: "receipt", quantity: 10, reference: `PO-${suffix}` }, admin!.id));

    await signInAsAdmin(page);
    await page.goto("/fr/admin/logistics/inventories", { waitUntil: "networkidle" });
    await page.getByLabel("Entrepôt").selectOption({ label: `${code} — Inventaire ${suffix}` });
    await page.getByLabel("Note").fill("Inventaire e2e");
    await page.getByTestId("logistics-inventory-open").click();
    await page.waitForURL(/\/fr\/admin\/logistics\/inventories\/[0-9a-f-]{36}$/);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-inventory-status]")).toHaveText("En cours");
    const row = page.locator(`[data-inventory-line="${sku}"]`);
    await expect(row).toContainText("10");

    // Saisie invalide : champ marqué, rien n'est enregistré.
    await row.getByLabel(`Compté — ${sku}`).fill("-2");
    await page.getByTestId("logistics-inventory-save").click();
    await expect(row.getByLabel(`Compté — ${sku}`)).toHaveAttribute("aria-invalid", "true");

    await row.getByLabel(`Compté — ${sku}`).fill("7");
    await page.getByTestId("logistics-inventory-save").click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`[data-inventory-line="${sku}"]`).getByLabel(`Compté — ${sku}`)).toHaveValue("7");

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId("logistics-inventory-validate").click();
    await expect(page.locator("[data-inventory-status]")).toHaveText("Validé");
    await expect(page.locator(`[data-inventory-line="${sku}"] [data-variance]`)).toHaveText("-3");
    await expect(page.getByTestId("logistics-inventory-validate")).toHaveCount(0);

    await page.goto(`/fr/admin/logistics/movements?warehouse=${warehouse.id}`, { waitUntil: "networkidle" });
    await expect(page.locator("[data-ledger-total]")).toHaveAttribute("data-ledger-total", "2");
    await page.getByLabel("Origine").selectOption("inventory");
    await page.getByTestId("logistics-ledger-apply").click();
    await page.waitForURL(/source=inventory/);
    await expect(page.locator("[data-ledger-total]")).toHaveAttribute("data-ledger-total", "1");
    await expect(page.getByTestId("logistics-ledger")).toContainText("Inventaire");
    await expect(page.getByTestId("logistics-ledger")).toContainText("-3");
    await expect(page.getByTestId("logistics-ledger").getByRole("link", { name: /^INV-/ })).toBeVisible();

    await page.goto("/fr/admin/logistics/stock", { waitUntil: "networkidle" });
    await expect(page.locator(`[data-stock-row="${code}:${sku}"] [data-level]`)).toHaveText("7");
  } finally {
    const db = getDrizzle();
    const warehouses = await db.select({ id: logisticsWarehouses.id }).from(logisticsWarehouses).where(eq(logisticsWarehouses.code, code));
    const ids = warehouses.map((w) => w.id);
    if (ids.length) {
      await db.delete(logisticsInventoryCounts).where(inArray(logisticsInventoryCounts.warehouseId, ids));
      await db.delete(logisticsStockMovements).where(inArray(logisticsStockMovements.warehouseId, ids));
    }
    await db.delete(logisticsItems).where(eq(logisticsItems.sku, sku));
    if (ids.length) await db.delete(logisticsWarehouses).where(inArray(logisticsWarehouses.id, ids));
  }
});
