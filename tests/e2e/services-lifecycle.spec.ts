import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { SEED_EMAIL, SEED_PASSWORD } from "./global-setup";

const BASE_URL = "http://localhost:4322";

async function authState(browser: import("@playwright/test").Browser) {
  const context = await browser.newContext();
  // better-auth limite /sign-in/email (5 req / 10 s) : en cas de 429, on attend
  // la fenêtre indiquée puis on réessaie (même stratégie que helpers/admin.ts).
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD }),
      redirect: "manual",
    });
    if (response.status !== 429) break;
    const retryAfter = Number(response.headers.get("x-retry-after") ?? response.headers.get("retry-after") ?? 10);
    await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(retryAfter, 1), 10) * 1000));
  }
  const cookies = response?.headers.getSetCookie() ?? [];
  if (!cookies.length) throw new Error(`Seed admin login failed (${response?.status})`);
  await context.addCookies(cookies.map((cookie) => {
    const [pair] = cookie.split(";");
    const separator = pair.indexOf("=");
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: BASE_URL };
  }));
  const state = await context.storageState();
  await context.close();
  return state;
}

test("services admin lifecycle follows the explicit state machine", async ({ browser }) => {
  const { getDrizzle, schema } = await import("../../src/database/drizzle");
  const { eq } = await import("drizzle-orm");
  const unique = randomUUID().slice(0, 8);
  const serviceId = randomUUID();
  const slug = `e2e-lifecycle-${unique}`;
  const title = `E2E Lifecycle Service ${unique}`;
  const db = getDrizzle();
  const [seedUser] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, SEED_EMAIL)).limit(1);
  if (!seedUser) throw new Error("Seed user not found");

  await db.insert(schema.services).values({ id: serviceId, organizationId: null, providerId: seedUser.id, slug, status: "DRAFT", publishedAt: null, updatedBy: seedUser.id });
  await db.insert(schema.serviceTranslations).values({ serviceId, locale: "fr", title, slug, content: `<p>${title}</p>`, excerpt: title, metaTitle: title, metaDescription: title });

  try {
    const state = await authState(browser);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    const readStatus = async () => {
      const [row] = await db.select({ status: schema.services.status }).from(schema.services).where(eq(schema.services.id, serviceId)).limit(1);
      return row?.status;
    };

    await page.goto("/fr/admin/services", { waitUntil: "networkidle" });
    const row = page.locator(`tr:has([data-id="${serviceId}"])`);
    await expect(row).toHaveCount(1);

    await row.locator(`[data-action="publish"][data-id="${serviceId}"]`).click();
    await page.waitForLoadState("networkidle");
    await expect.poll(readStatus).toBe("PUBLISHED");

    await page.locator(`tr:has([data-id="${serviceId}"]) [data-action="unpublish"][data-id="${serviceId}"]`).click();
    await page.waitForLoadState("networkidle");
    await expect.poll(readStatus).toBe("DRAFT");

    // L'archivage demande une confirmation native (window.confirm) : Playwright la refuse par défaut.
    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator(`tr:has([data-id="${serviceId}"]) [data-action="archive"][data-id="${serviceId}"]`).click();
    await page.waitForLoadState("networkidle");
    await expect.poll(readStatus).toBe("ARCHIVED");

    await page.locator(`tr:has([data-id="${serviceId}"]) [data-action="restore"][data-id="${serviceId}"]`).click();
    await page.waitForLoadState("networkidle");
    await expect.poll(readStatus).toBe("DRAFT");

    await context.close();
  } finally {
    await db.delete(schema.services).where(eq(schema.services.id, serviceId)).catch(() => {});
  }
});

test("services admin bulk bar: select, publish, then archive with modal confirmation", async ({ browser }) => {
  const { getDrizzle, schema } = await import("../../src/database/drizzle");
  const { eq, inArray } = await import("drizzle-orm");
  const unique = randomUUID().slice(0, 8);
  const ids = [randomUUID(), randomUUID()];
  const db = getDrizzle();
  const [seedUser] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, SEED_EMAIL)).limit(1);
  if (!seedUser) throw new Error("Seed user not found");
  const titles = ids.map((_, i) => `E2E Bulk Service ${unique} ${i}`);
  await db.insert(schema.services).values(ids.map((id, i) => ({ id, organizationId: null, providerId: seedUser.id, slug: `e2e-bulk-${unique}-${i}`, status: "DRAFT" as const, updatedBy: seedUser.id })));
  await db.insert(schema.serviceTranslations).values(ids.map((serviceId, i) => ({ serviceId, locale: "fr" as const, title: titles[i]!, slug: `e2e-bulk-${unique}-${i}`, content: `<p>${titles[i]}</p>`, excerpt: titles[i]!, metaTitle: titles[i]!, metaDescription: titles[i]! })));
  const statuses = async () => (await db.select({ status: schema.services.status }).from(schema.services).where(inArray(schema.services.id, ids))).map((r) => r.status).sort();

  try {
    const context = await browser.newContext({ storageState: await authState(browser) });
    const page = await context.newPage();
    await page.goto(`/fr/admin/services?search=${encodeURIComponent(`E2E Bulk Service ${unique}`)}`, { waitUntil: "networkidle" });
    const bar = page.getByRole("region", { name: "Actions groupées" });
    await expect(bar.getByRole("button", { name: "Publier", exact: true })).toBeDisabled();
    for (const title of titles) await page.getByRole("checkbox", { name: `Sélectionner « ${title} »` }).check();
    await expect(bar.locator("[data-bulk-count]")).toHaveText("2 élément(s) sélectionné(s)");
    await bar.getByRole("button", { name: "Publier", exact: true }).click();
    await expect.poll(statuses).toEqual(["PUBLISHED", "PUBLISHED"]);

    await page.waitForLoadState("networkidle");
    await page.getByRole("checkbox", { name: "Sélectionner tous les éléments de la page" }).check();
    await bar.getByRole("button", { name: "Archiver", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Confirmer l'action groupée" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    expect(await statuses()).toEqual(["PUBLISHED", "PUBLISHED"]);
    await bar.getByRole("button", { name: "Archiver", exact: true }).click();
    await dialog.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect.poll(statuses).toEqual(["ARCHIVED", "ARCHIVED"]);
    await context.close();
  } finally {
    await db.delete(schema.services).where(inArray(schema.services.id, ids));
  }
});
