/** Back-office achats : fournisseur créé via le formulaire, commande fournisseur, envoi (n° de BC), réception partielle (n° de BR, entrée de stock). */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

test("admin achats : fournisseur, commande, envoi numéroté puis réception partielle en stock", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(120_000);
  const { getDrizzle } = await import("../../src/database/drizzle");
  const { logisticsItems, logisticsStockMovements, logisticsWarehouses, purchasing, purchasingReceipts, purchasingSuppliers } = await import("../../src/database/schemas");
  const { and, eq, inArray } = await import("drizzle-orm");
  const db = getDrizzle();
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const code = `SUP${suffix}`;
  const sku = `PUR-${suffix}`;
  const title = `E2E commande ${suffix}`;
  // Entrepôt et article (module logistique) insérés directement.
  const [wh] = await db.insert(logisticsWarehouses).values({ code: `PW${suffix}`, name: `Entrepôt achats ${suffix}` }).returning({ id: logisticsWarehouses.id });
  const [item] = await db.insert(logisticsItems).values({ sku, name: `Article achats ${suffix}` }).returning({ id: logisticsItems.id });
  try {
    await signInAsAdmin(page);
    await page.goto("/fr/admin/purchasing/suppliers", { waitUntil: "networkidle" });
    await page.locator("#po-sup-new-code").fill(code.toLowerCase());
    await page.locator("#po-sup-new-name").fill(`Fournisseur ${suffix}`);
    await page.locator("#po-sup-new-country").fill("fr");
    await page.getByRole("button", { name: "Créer" }).click();
    await expect(page.getByTestId("purchasing-supplier-list")).toContainText(code);

    await page.goto("/fr/admin/purchasing", { waitUntil: "networkidle" });
    await page.getByTestId("purchasing-new-order").click();
    await page.waitForURL(/\/fr\/admin\/purchasing\/new$/);
    await page.waitForLoadState("networkidle");
    await page.locator("#po-title").fill(title);
    await page.locator("#po-supplier").selectOption({ label: `${code} — Fournisseur ${suffix}` });
    await page.locator("#po-warehouse").selectOption({ label: `PW${suffix} — Entrepôt achats ${suffix}` });
    await page.locator("#po-sku-0").fill(sku);
    await page.locator("#po-qty-0").fill("6");
    await page.locator("#po-price-0").fill("12.50");
    await page.getByRole("button", { name: "Créer" }).click();
    await page.waitForURL(/\/fr\/admin\/purchasing\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("purchasing-heading")).toContainText(title);
    await expect(page.getByTestId("purchasing-status")).toHaveText("Brouillon");
    await expect(page.getByTestId("purchasing-lines")).toContainText(sku);
    await expect(page.getByTestId("purchasing-net")).toContainText("75");

    await page.getByTestId("purchasing-to-SENT").click();
    await expect(page.getByTestId("purchasing-status")).toHaveText("Envoyée");
    await expect(page.getByTestId("purchasing-number")).not.toHaveText("—");

    const qty = page.locator("[data-receipt-line] input[name=quantity]");
    await expect(qty).toHaveValue("6");
    await qty.fill("4");
    await page.locator("#po-rcv-ref").fill(`BL-${suffix}`);
    await page.getByRole("button", { name: "Réceptionner" }).click();
    await expect(page.getByTestId("purchasing-status")).toHaveText("Partiellement reçue");
    await expect(page.getByTestId("purchasing-receipts")).toContainText(`BL-${suffix}`);
    await expect(page.locator("[data-receipt-line] input[name=quantity]")).toHaveValue("2");

    const movements = await db.select({ delta: logisticsStockMovements.delta }).from(logisticsStockMovements).where(and(eq(logisticsStockMovements.itemId, item!.id), eq(logisticsStockMovements.kind, "receipt")));
    expect(movements.map((m) => m.delta)).toEqual([4]);
  } finally {
    const orders = await db.select({ id: purchasing.id }).from(purchasing).where(eq(purchasing.warehouseId, wh!.id));
    if (orders.length) {
      await db.delete(purchasingReceipts).where(inArray(purchasingReceipts.orderId, orders.map((o) => o.id)));
      await db.delete(purchasing).where(inArray(purchasing.id, orders.map((o) => o.id)));
    }
    await db.delete(logisticsStockMovements).where(eq(logisticsStockMovements.itemId, item!.id));
    await db.delete(purchasingSuppliers).where(eq(purchasingSuppliers.code, code));
    await db.delete(logisticsItems).where(eq(logisticsItems.id, item!.id));
    await db.delete(logisticsWarehouses).where(eq(logisticsWarehouses.id, wh!.id));
  }
});
