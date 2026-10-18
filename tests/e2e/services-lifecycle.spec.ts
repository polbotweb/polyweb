import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { SEED_EMAIL, SEED_PASSWORD } from "./global-setup";

const BASE_URL = "http://localhost:4322";

async function authState(browser: import("@playwright/test").Browser) {
  const context = await browser.newContext();
  const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD }),
    redirect: "manual",
  });
  const cookies = response.headers.getSetCookie();
  if (!cookies.length) throw new Error(`Seed admin login failed (${response.status})`);
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
