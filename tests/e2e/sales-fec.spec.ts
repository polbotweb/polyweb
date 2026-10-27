/** Back-office ventes : exports FEC — export prêt d'un tenant listé et téléchargé (Latin-9, en-tête FEC), période non close refusée. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

test("admin ventes : exports FEC — liste, téléchargement, période refusée", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(90_000);
  const { getDrizzle, schema } = await import("../../src/database/drizzle");
  const { salesFecExports, salesSellerProfiles } = await import("../../src/database/schemas");
  const { Effect } = await import("effect");
  const { PrivateStorage, privateStorage } = await import("../../src/lib/storage/private");
  const { fecExportService } = await import("../../src/modules/sales/services/fecExport.service");
  const { eq } = await import("drizzle-orm");
  const orgId = `e2e-fec-${randomUUID().slice(0, 8)}`;
  const period = "2001-02";
  const db = getDrizzle();
  try {
    await db.insert(schema.organization).values({ id: orgId, name: `Tenant FEC ${orgId}`, slug: orgId, createdAt: new Date() });
    await db.insert(salesSellerProfiles).values({ organizationId: orgId, legalName: "Vendeur e2e", legalId: "732829320", legalIdScheme: "0002", country: "FR" });
    await Effect.runPromise(fecExportService.generate({ organizationId: orgId, period, authorId: null }).pipe(Effect.provideService(PrivateStorage, privateStorage())));

    await signInAsAdmin(page);
    await page.goto("/fr/admin/sales/fec", { waitUntil: "networkidle" });
    const row = page.locator(`[data-fec-row="${orgId}:${period}"]`);
    await expect(row.locator("[data-fec-status]")).toHaveAttribute("data-fec-status", "READY");
    await expect(row).toContainText(`Tenant FEC ${orgId}`);

    const [download] = await Promise.all([page.waitForEvent("download"), row.getByTestId("sales-fec-download").click()]);
    expect(download.suggestedFilename()).toBe("732829320FEC20010228.txt");
    const bytes = await readFile((await download.path())!);
    expect(bytes.subarray(0, 12).toString("latin1")).toBe("JournalCode|");
    expect(bytes.subarray(-2).toString("latin1")).toBe("\r\n");

    // Mois non clos : refus serveur affiché, aucun export plateforme créé.
    await page.locator("#sales-fec-period").fill("2999-01");
    await page.getByTestId("sales-fec-generate").click();
    const error = page.locator("[data-fec-export-form] [data-form-error]");
    await expect(error).toBeVisible();
    await expect(error).not.toHaveText(/AAAA-MM/);
    await expect(page.locator('[data-fec-row="platform:2999-01"]')).toHaveCount(0);
  } finally {
    const rows = await db.select({ storageKey: salesFecExports.storageKey }).from(salesFecExports).where(eq(salesFecExports.organizationId, orgId));
    for (const r of rows) if (r.storageKey) await Effect.runPromise(Effect.ignore(privateStorage().remove(r.storageKey)));
    await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
  }
});
