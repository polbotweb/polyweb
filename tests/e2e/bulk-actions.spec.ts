/**
 * Barre d'actions groupées générique (AdminBulkBar → core/bulk) sur les listes admin
 * blog et pages : sélection au clavier/souris, compteur annoncé, confirmation modale,
 * effet réel en base. (Services : services-lifecycle.spec.ts.)
 */
import { randomUUID } from "node:crypto";
import { expect, test, type Browser } from "@playwright/test";
import { SEED_EMAIL, SEED_PASSWORD } from "./global-setup";

const BASE_URL = "http://localhost:4322";

async function authedPage(browser: Browser) {
  const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD }),
    redirect: "manual",
  });
  const cookies = response.headers.getSetCookie();
  if (!cookies.length) throw new Error(`Seed admin login failed (${response.status})`);
  const context = await browser.newContext();
  await context.addCookies(cookies.map((cookie) => {
    const [pair] = cookie.split(";");
    const separator = pair.indexOf("=");
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: BASE_URL };
  }));
  return { context, page: await context.newPage() };
}

async function seedUserId() {
  const { getDrizzle, schema } = await import("../../src/database/drizzle");
  const { eq } = await import("drizzle-orm");
  const [row] = await getDrizzle().select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, SEED_EMAIL)).limit(1);
  if (!row) throw new Error("Seed user not found");
  return row.id;
}

test("blog admin: bulk publish then bulk delete with confirmation", async ({ browser }) => {
  const { getDrizzle, schema } = await import("../../src/database/drizzle");
  const { inArray } = await import("drizzle-orm");
  const db = getDrizzle();
  const author = await seedUserId();
  const unique = randomUUID().slice(0, 8);
  const ids = [randomUUID(), randomUUID()];
  const titles = ids.map((_, i) => `E2E Bulk Post ${unique} ${i}`);
  await db.insert(schema.blogPosts).values(ids.map((id, i) => ({ id, authorId: author, slug: `e2e-bulk-post-${unique}-${i}`, status: "DRAFT" as const })));
  await db.insert(schema.blogPostTranslations).values(ids.map((postId, i) => ({ postId, locale: "fr" as const, title: titles[i]!, slug: `e2e-bulk-post-${unique}-${i}`, content: "<p>x</p>", excerpt: "x" })));
  const statuses = async () => (await db.select({ s: schema.blogPosts.status }).from(schema.blogPosts).where(inArray(schema.blogPosts.id, ids))).map((r) => r.s).sort();
  try {
    const { context, page } = await authedPage(browser);
    await page.goto(`/fr/admin/blog?search=${encodeURIComponent(`E2E Bulk Post ${unique}`)}`, { waitUntil: "networkidle" });
    const bar = page.getByRole("region", { name: "Actions groupées" });
    await expect(bar.locator("[data-bulk-count]")).toHaveText("Aucun élément sélectionné");
    for (const title of titles) await page.getByRole("checkbox", { name: `Sélectionner « ${title} »` }).first().check();
    await expect(bar.locator("[data-bulk-count]")).toHaveText("2 élément(s) sélectionné(s)");
    await bar.locator('[data-bulk-op="publish"]').click();
    await expect.poll(statuses).toEqual(["PUBLISHED", "PUBLISHED"]);

    await page.waitForLoadState("networkidle");
    await page.getByRole("checkbox", { name: "Sélectionner tous les éléments de la page" }).first().check();
    await bar.locator('[data-bulk-op="delete"]').click();
    const dialog = page.getByRole("dialog", { name: "Confirmer l'action groupée" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect.poll(statuses).toEqual(["DELETED", "DELETED"]);
    await context.close();
  } finally {
    await db.delete(schema.blogPosts).where(inArray(schema.blogPosts.id, ids));
  }
});

test("pages admin: select visible page rows, bulk publish, then move to trash with confirmation", async ({ browser }) => {
  const { getDrizzle, schema } = await import("../../src/database/drizzle");
  const { inArray } = await import("drizzle-orm");
  const db = getDrizzle();
  const unique = randomUUID().slice(0, 8);
  const ids = [randomUUID(), randomUUID()];
  const titles = ids.map((_, i) => `E2E Bulk Page ${unique} ${i}`);
  // locale « ar » + sortOrder très négatif : en tête de la première page de la liste.
  await db.insert(schema.pages).values(ids.map((id, i) => ({ id, locale: "ar" as const, title: titles[i]!, slug: `e2e-bulk-page-${unique}-${i}`, sortOrder: -100000 + i })));
  const state = async () => (await db.select({ p: schema.pages.isPublished, d: schema.pages.deletedAt }).from(schema.pages).where(inArray(schema.pages.id, ids))).map((r) => `${r.p}:${r.d ? "trash" : "live"}`).sort();
  try {
    const { context, page } = await authedPage(browser);
    await page.goto("/fr/admin/pages", { waitUntil: "networkidle" });
    // Filtre client : « toute la page » ne doit cocher que les lignes visibles.
    await page.locator("#admin-page-search").fill(`e2e bulk page ${unique}`);
    const bar = page.getByRole("region", { name: "Actions groupées" });
    await page.getByRole("checkbox", { name: "Sélectionner tous les éléments de la page" }).check();
    await expect(bar.locator("[data-bulk-count]")).toHaveText("2 élément(s) sélectionné(s)");
    await bar.locator('[data-bulk-op="publish"]').click();
    await expect.poll(state).toEqual(["true:live", "true:live"]);

    await page.waitForLoadState("networkidle");
    for (const title of titles) await page.getByRole("checkbox", { name: `Sélectionner « ${title} »` }).first().check();
    await bar.locator('[data-bulk-op="archive"]').click();
    const dialog = page.getByRole("dialog", { name: "Confirmer l'action groupée" });
    await dialog.getByRole("button", { name: "Annuler" }).click();
    expect(await state()).toEqual(["true:live", "true:live"]);
    await bar.locator('[data-bulk-op="archive"]').click();
    await dialog.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect.poll(state).toEqual(["false:trash", "false:trash"]);
    await context.close();
  } finally {
    await db.delete(schema.pages).where(inArray(schema.pages.id, ids));
  }
});

test("services admin: facets (links with counts) and saved views (save, open, delete with confirmation)", async ({ browser }) => {
  const { getDrizzle, schema } = await import("../../src/database/drizzle");
  const { and, eq } = await import("drizzle-orm");
  const db = getDrizzle();
  const owner = await seedUserId();
  const name = `E2E vue ${randomUUID().slice(0, 6)}`;
  // Au moins un brouillon pour que la facette « Brouillon » existe.
  const serviceId = randomUUID();
  await db.insert(schema.services).values({ id: serviceId, providerId: owner, slug: `e2e-facet-${serviceId.slice(0, 8)}`, status: "DRAFT", updatedBy: owner });
  try {
    const { context, page } = await authedPage(browser);
    await page.goto("/fr/admin/services", { waitUntil: "networkidle" });
    const facets = page.getByRole("navigation", { name: "Affiner" });
    await expect(facets).toBeVisible();
    const draft = facets.locator('a[data-facet-value="DRAFT"]');
    await draft.click();
    await page.waitForURL(/status=DRAFT/);
    await expect(page.getByRole("navigation", { name: "Affiner" }).locator('a[data-facet-value="DRAFT"]')).toHaveAttribute("aria-current", "true");

    const views = page.getByRole("region", { name: "Vues enregistrées" });
    await views.getByLabel("Nom de la vue").fill(name);
    await views.getByRole("button", { name: "Enregistrer la vue actuelle" }).click();
    await expect(views.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
    const [row] = await db.select().from(schema.adminSavedViews).where(and(eq(schema.adminSavedViews.userId, owner), eq(schema.adminSavedViews.name, name)));
    expect(row?.query).toBe("status=DRAFT");

    await page.goto("/fr/admin/services", { waitUntil: "networkidle" });
    await page.getByRole("region", { name: "Vues enregistrées" }).getByRole("link", { name }).click();
    await page.waitForURL(/status=DRAFT/);
    await page.getByRole("region", { name: "Vues enregistrées" }).getByRole("button", { name: `Supprimer la vue « ${name} »` }).click();
    await page.getByRole("dialog", { name: "Supprimer la vue" }).getByRole("button", { name: "Supprimer", exact: true }).click();
    await expect.poll(async () => (await db.select().from(schema.adminSavedViews).where(and(eq(schema.adminSavedViews.userId, owner), eq(schema.adminSavedViews.name, name)))).length).toBe(0);
    await context.close();
  } finally {
    await db.delete(schema.adminSavedViews).where(and(eq(schema.adminSavedViews.userId, owner), eq(schema.adminSavedViews.name, name)));
    await db.delete(schema.services).where(eq(schema.services.id, serviceId));
  }
});
