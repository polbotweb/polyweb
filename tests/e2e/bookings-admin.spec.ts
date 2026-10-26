/** Back-office réservations : ressource créée via le formulaire (plage d'ouverture), créneaux libres, réservation, confirmation numérotée, refus d'un chevauchement. */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

test("admin réservations : ressource, créneau libre, confirmation numérotée puis conflit refusé", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(120_000);
  const { getDrizzle } = await import("../../src/database/drizzle");
  const { bookings, bookingsResources } = await import("../../src/database/schemas");
  const { eq, inArray } = await import("drizzle-orm");
  const db = getDrizzle();
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const code = `RM${suffix}`;
  const day = new Date(Date.now() + 30 * 86_400_000);
  const date = day.toISOString().slice(0, 10);
  try {
    await signInAsAdmin(page);
    await page.goto("/fr/admin/bookings/resources", { waitUntil: "networkidle" });
    await page.locator("#bk-res-new-code").fill(code.toLowerCase());
    await page.locator("#bk-res-new-name").fill(`Salle ${suffix}`);
    await page.locator("#bk-res-new-capacity").fill("4");
    await page.locator("#bk-res-new-tz").fill("UTC");
    await page.locator("#bk-res-new-wd-0").selectOption(String(day.getUTCDay()));
    await page.locator("#bk-res-new-ws-0").fill("09:00");
    await page.locator("#bk-res-new-we-0").fill("12:00");
    await page.getByRole("button", { name: "Créer" }).click();
    await expect(page.getByTestId("bookings-resource-list")).toContainText(code);

    for (const attempt of [1, 2]) {
      await page.goto("/fr/admin/bookings/new", { waitUntil: "networkidle" });
      await page.locator("#bk-new-resource").selectOption({ label: `${code} — Salle ${suffix} (UTC)` });
      await page.locator("#bk-new-date").fill(date);
      if (attempt === 1) {
        await page.getByRole("button", { name: "Voir les créneaux" }).click();
        await page.getByTestId("bookings-slots").getByRole("button", { name: "09:00–09:30" }).click();
        await expect(page.locator("#bk-new-time")).toHaveValue("09:00");
      } else {
        await page.locator("#bk-new-time").fill("09:15");
      }
      await page.locator("#bk-new-customer").fill(`Client ${suffix} ${attempt}`);
      await page.locator("#bk-new-party").fill("2");
      await page.getByRole("button", { name: "Créer" }).click();
      if (attempt === 1) {
        await page.waitForURL(/\/fr\/admin\/bookings\/[0-9a-f-]{36}$/);
        await expect(page.getByTestId("bookings-status")).toHaveText("Demandée");
        await expect(page.getByTestId("bookings-when")).toContainText("09:00");
        await page.getByTestId("bookings-to-CONFIRMED").click();
        await expect(page.getByTestId("bookings-status")).toHaveText("Confirmée");
        await expect(page.getByTestId("bookings-number")).toContainText("RES-");
      } else {
        await expect(page.locator("[data-form-error]")).toBeVisible();
        await expect(page).toHaveURL(/\/fr\/admin\/bookings\/new$/);
      }
    }

    await page.goto("/fr/admin/bookings", { waitUntil: "networkidle" });
    await expect(page.getByTestId("bookings-list")).toContainText(`Client ${suffix} 1`);
    await expect(page.getByTestId("bookings-list")).not.toContainText(`Client ${suffix} 2`);
  } finally {
    const resources = await db.select({ id: bookingsResources.id }).from(bookingsResources).where(eq(bookingsResources.code, code));
    if (resources.length) {
      await db.delete(bookings).where(inArray(bookings.resourceId, resources.map((r) => r.id)));
      await db.delete(bookingsResources).where(inArray(bookingsResources.id, resources.map((r) => r.id)));
    }
  }
});
