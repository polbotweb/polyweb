/**
 * Forums : administration (catégorie en 4 langues, étiquette), création d'un sujet avec sondage
 * et étiquette (formulaire sans JS), vote au sondage, réponse, recherche plein texte, verrouillage
 * motivé par un modérateur, et lecture anonyme sans formulaire de réponse.
 */
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";

test("forums : catégories → sujet + sondage → réponse → recherche → verrouillage", async ({ page, browserName, browser }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(150_000);
  const { getDrizzle } = await import("../../src/database/drizzle");
  const { forumCategories, forumTags, forumTopics } = await import("../../src/database/schemas");
  const { eq } = await import("drizzle-orm");
  const db = getDrizzle();
  const stamp = Date.now().toString(36);
  const title = `E2E sujet ${stamp}`;
  const categorySlug = `e2e-${stamp}`;
  const tagLabel = `E2E${stamp}`;
  try {
    await signInAsAdmin(page);
    await page.goto("/fr/admin/forums", { waitUntil: "networkidle" });
    await expect(page.getByTestId("admin-forums")).toBeVisible();
    const forumCard = page.locator("[data-forum]").first();
    const forumSlug = await forumCard.getAttribute("data-forum");
    expect(forumSlug).toBeTruthy();
    await forumCard.locator("summary", { hasText: "Ajouter une catégorie" }).click();
    const add = forumCard.getByTestId(`add-category-${forumSlug}`);
    await add.getByLabel("Identifiant d'URL").fill(categorySlug);
    await add.getByLabel("Nom (Français)").fill(`Catégorie ${stamp}`);
    await add.getByLabel("Nom (English)").fill(`Category ${stamp}`);
    await add.getByRole("button", { name: "Ajouter une catégorie" }).click();
    await expect(page.getByTestId("forum-notice")).toHaveText("Modifications enregistrées.");
    await expect(page.locator(`[data-category="${categorySlug}"]`)).toBeVisible();
    await page.getByLabel("Libellé").fill(tagLabel);
    await page.getByRole("button", { name: "Ajouter une étiquette" }).click();
    await expect(page.getByTestId("tags")).toContainText(tagLabel);

    await page.goto(`/fr/forums/${forumSlug}`, { waitUntil: "networkidle" });
    const form = page.getByTestId("new-topic-form");
    await form.getByLabel("Titre", { exact: true }).fill(title);
    await form.locator("select[name=categoryId]").selectOption({ label: `Catégorie ${stamp}` });
    await form.getByLabel("Message", { exact: true }).fill("Quel **format** préférez-vous ?\n\n- court\n- long");
    await form.getByLabel(tagLabel).check();
    await form.getByLabel("Ajouter un sondage").check();
    await form.getByLabel("Question", { exact: true }).fill("Format ?");
    await form.getByLabel(/Options \(une par ligne\)/).fill("Court\nLong");
    await form.getByTestId("new-topic-submit").click();
    await page.waitForURL(/\/t\/[0-9a-f-]{36}\?notice=topicCreated/);
    await expect(page.getByTestId("forum-notice")).toHaveText("Sujet publié.");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByTestId("topic").locator("strong")).toHaveText("format");

    await page.getByTestId("poll").getByLabel("Long").check();
    await page.getByTestId("poll-submit").click();
    await expect(page.getByTestId("forum-notice")).toHaveText("Vote au sondage enregistré.");
    await expect(page.getByTestId("poll-results")).toContainText("Long");

    await page.getByTestId("reply-form").getByLabel("Votre réponse").fill("Réponse **E2E** avec le mot zéphyr");
    await page.getByTestId("reply-submit").click();
    await expect(page.getByTestId("forum-notice")).toHaveText("Réponse publiée.");
    await expect(page.getByTestId("posts").locator("li")).toHaveCount(1);
    const topicUrl = page.url().split("?")[0];

    await page.goto(`/fr/forums/${forumSlug}?q=${encodeURIComponent("zéphyr")}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("topic-list")).toContainText(title);
    const [tag] = await db.select({ slug: forumTags.slug }).from(forumTags).where(eq(forumTags.label, tagLabel));
    await page.goto(`/fr/forums/${forumSlug}?tag=${encodeURIComponent(tag.slug)}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("topic-list")).toContainText(title);

    await page.goto(topicUrl, { waitUntil: "networkidle" });
    const tools = page.getByTestId("moderator-tools");
    await tools.locator("select[name=tool]").selectOption("lock");
    await tools.locator("input[name=note]").fill("Discussion close");
    await tools.getByTestId("moderate-submit").click();
    await expect(page.getByTestId("forum-notice")).toHaveText("Action de modération appliquée.");
    await expect(page.getByTestId("topic-locked")).toBeVisible();

    const anonymous = await browser.newContext();
    try {
      const anon = await anonymous.newPage();
      await anon.goto(topicUrl, { waitUntil: "networkidle" });
      await expect(anon.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(anon.getByTestId("reply-form")).toHaveCount(0);
      await expect(anon.getByText("Connectez-vous pour participer.")).toBeVisible();
      const missing = await anon.goto(`/fr/forums/${forumSlug}/t/00000000-0000-4000-8000-000000000000`);
      expect(missing?.status()).toBe(404);
    } finally {
      await anonymous.close();
    }
  } finally {
    await db.delete(forumTopics).where(eq(forumTopics.title, title));
    await db.delete(forumCategories).where(eq(forumCategories.slug, categorySlug));
    await db.delete(forumTags).where(eq(forumTags.label, tagLabel));
  }
});
