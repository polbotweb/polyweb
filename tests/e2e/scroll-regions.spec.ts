/**
 * Régions défilantes (ScrollRegion) : un tableau qui déborde doit être
 * atteignable au clavier (Tab), nommé (role=region + nom accessible), avoir un
 * focus visible, et défiler avec les flèches — en LTR comme en RTL.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

/** Tabule jusqu'à la région (preuve d'accessibilité clavier, pas de focus() programmatique). */
async function tabTo(page: Page, region: Locator): Promise<void> {
  for (let i = 0; i < 150; i++) {
    await page.keyboard.press("Tab");
    if (await region.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error("ScrollRegion jamais atteinte au clavier");
}

async function expectNamedRegion(region: Locator): Promise<void> {
  await expect(region).toHaveAttribute("role", "region");
  await expect(region).toHaveAttribute("tabindex", "0");
  const name = await region.evaluate((el) => {
    const by = el.getAttribute("aria-labelledby");
    const text = by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ") : el.getAttribute("aria-label") ?? "";
    return text.trim();
  });
  expect(name.length, "nom accessible non vide").toBeGreaterThan(0);
}

for (const locale of ["fr", "ar"] as const) {
  test(`services admin (${locale}) : la région du tableau est focusable au clavier et défile aux flèches`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Parcours admin : Chromium");
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1100, height: 800 }); // ≥ lg : tableau visible, min-w 1380px → débordement garanti
    await signInAsAdmin(page);
    const response = await page.goto(`/${locale}/admin/services`, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);

    const region = page.locator("[data-scroll-region]:visible").filter({ has: page.locator("table") }).first();
    await expect(region).toBeVisible();
    await expectNamedRegion(region);
    expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth), "le tableau déborde").toBe(true);

    await tabTo(page, region);
    const outline = await region.evaluate((el) => { const s = getComputedStyle(el); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(3);

    const before = await region.evaluate((el) => Math.abs(el.scrollLeft));
    const key = locale === "ar" ? "ArrowLeft" : "ArrowRight"; // RTL : le contenu masqué est à gauche
    for (let i = 0; i < 5; i++) await page.keyboard.press(key);
    await expect.poll(() => region.evaluate((el) => Math.abs(el.scrollLeft))).toBeGreaterThan(before);
  });
}

test("tableau de bord : toutes les régions défilantes sont nommées et focusables", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  await signInAsAdmin(page);
  await page.goto("/fr/admin/dashboard", { waitUntil: "networkidle" });
  const regions = page.locator("[data-scroll-region]");
  expect(await regions.count()).toBeGreaterThan(0);
  for (const region of await regions.all()) await expectNamedRegion(region);
});
