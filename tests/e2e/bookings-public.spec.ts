/** Réservation publique (visiteur, sans JS requis) : créneau, confirmation, lien signé, annulation ; RTL, origine croisée refusée, axe. */
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Demain (UTC) : des créneaux libres quelle que soit l’heure du run. */
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const ALL_DAY = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: "00:00", end: "24:00" }));

/** Ressource ouverte 24 h/24 (créneaux toujours disponibles), supprimée en fin de test avec ses réservations. */
async function withResource(organizationId: string | null, run: (code: string) => Promise<void>) {
  const { getDrizzle } = await import("../../src/database/drizzle");
  const { bookings, bookingsResources } = await import("../../src/modules/bookings/schema");
  const { eq } = await import("drizzle-orm");
  const db = getDrizzle();
  const code = `PB${randomUUID().slice(0, 8).toUpperCase()}`;
  const [row] = await db.insert(bookingsResources).values({ organizationId, code, name: `Salle ${code}`, capacity: 3, timezone: "UTC", slotMinutes: 60, windows: ALL_DAY }).returning({ id: bookingsResources.id });
  try {
    await run(code);
  } finally {
    await db.delete(bookings).where(eq(bookings.resourceId, row.id));
    await db.delete(bookingsResources).where(eq(bookingsResources.id, row.id));
  }
}

async function expectNoSeriousAxe(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`);
  expect(serious, serious.join("\n")).toEqual([]);
}

/** Remplit et envoie le formulaire (le jeton anti-robot exige ≥ 2 s entre affichage et envoi). */
async function book(page: Page, name: string) {
  const form = page.getByTestId("booking-form");
  await form.evaluate((f) => ((f as HTMLFormElement).noValidate = true));
  await form.locator('input[name="startsAt"]').first().check();
  await page.locator("#bk-customerName").fill(name);
  await page.locator("#bk-customerEmail").fill("guest@example.test");
  await page.locator("#bk-customerPhone").fill("+33 6 12 34 56 78");
  await page.locator("#bk-partySize").fill("2");
  await page.waitForTimeout(2_200);
  await form.locator('button[type="submit"]').click();
}

test("visiteur : réserve un créneau, consulte puis annule via le lien signé", async ({ page }) => {
  test.setTimeout(90_000);
  await withResource(null, async (code) => {
    await page.goto("/en/bookings", { waitUntil: "networkidle" });
    await expect(page.getByTestId("booking-resources")).toContainText(`Salle ${code}`);
    await page.goto(`/en/bookings/${code}?date=${tomorrow()}`, { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toContainText(`Salle ${code}`);

    // Saisie invalide : récapitulatif des erreurs relié aux champs, valeurs conservées.
    const form = page.getByTestId("booking-form");
    await form.evaluate((f) => ((f as HTMLFormElement).noValidate = true));
    await page.locator("#bk-customerEmail").fill("not-an-email");
    await page.waitForTimeout(2_200);
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('a[href="#bk-customerEmail"]')).toBeVisible();
    await expect(page.locator("#bk-customerEmail")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#bk-customerEmail")).toHaveValue("not-an-email");

    await book(page, "Grace Hopper");
    await page.waitForURL(/\/en\/bookings\/manage\/[0-9a-f-]{36}\?t=[\w-]{32}&created=1/);
    await expect(page.locator("#bk-notice")).toBeVisible();
    await expect(page.getByTestId("booking-status")).toHaveText("Requested");
    await expect(page.getByTestId("booking-summary")).toContainText(`Salle ${code}`);
    await expectNoSeriousAxe(page);

    // Le lien sans jeton valide ne divulgue rien.
    const url = new URL(page.url());
    const res = await page.request.get(`${url.pathname}?t=${"x".repeat(32)}`);
    expect(res.status()).toBe(404);

    await page.locator('form[method="post"] button[type="submit"]').click();
    await page.waitForURL(/cancelled=1/);
    await expect(page.getByTestId("booking-status")).toHaveText("Cancelled");
    await expect(page.locator('form[method="post"]')).toHaveCount(0);
  });
});

test("visiteur : page arabe en RTL, axe sans violation grave", async ({ page }) => {
  await withResource(null, async (code) => {
    await page.goto(`/ar/bookings/${code}?date=${tomorrow()}`, { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator('input[name="startsAt"]').first()).toBeVisible();
    await expectNoSeriousAxe(page);
  });
});

test("envoi depuis une autre origine refusé (CSRF)", async ({ request }) => {
  await withResource(null, async (code) => {
    const res = await request.post(`/en/bookings/${code}`, {
      headers: { Origin: "https://evil.example", "Content-Type": "application/x-www-form-urlencoded" },
      data: "customerName=X&customerEmail=x%40example.test&partySize=1",
      maxRedirects: 0,
    });
    expect(res.status()).toBe(403);
  });
});

test("organisation : parcours sous /[lang]/[organization]/bookings, isolé de la plateforme", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Variante organisation : Chromium");
  test.setTimeout(90_000);
  const { getDrizzle } = await import("../../src/database/drizzle");
  const { organization } = await import("../../src/database/schemas");
  const { eq } = await import("drizzle-orm");
  const db = getDrizzle();
  const slug = `pb-org-${randomUUID().slice(0, 8)}`;
  await db.insert(organization).values({ id: slug, name: `Org ${slug}`, slug, createdAt: new Date() });
  try {
    await withResource(slug, async (code) => {
      // La ressource d'organisation n'est pas visible côté plateforme.
      expect((await page.request.get(`/fr/bookings/${code}`)).status()).toBe(404);
      await page.goto(`/fr/${slug}/bookings`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("booking-resources")).toContainText(`Salle ${code}`);
      await page.goto(`/fr/${slug}/bookings/${code}?date=${tomorrow()}`, { waitUntil: "networkidle" });
      await book(page, "Ada Lovelace");
      await page.waitForURL(new RegExp(`/fr/${slug}/bookings/manage/[0-9a-f-]{36}\\?t=`));
      await expect(page.getByTestId("booking-status")).toHaveText("Demandée");
    });
  } finally {
    await db.delete(organization).where(eq(organization.id, slug));
  }
  expect((await page.request.get(`/fr/${slug}-nope/bookings`)).status()).toBe(404);
});
