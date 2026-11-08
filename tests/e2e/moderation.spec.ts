/** Modération générique : signalement anonyme d'un commentaire, masquage motivé depuis la file admin, puis rétablissement. */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";
import { SEED_EMAIL } from "./global-setup";

test("modération : signalement → masquage → rétablissement", async ({ page, browserName, playwright, baseURL }) => {
  test.skip(browserName !== "chromium", "Parcours admin : Chromium");
  test.setTimeout(120_000);
  const { getDrizzle } = await import("../../src/database/drizzle");
  const { blogComments, blogPosts, moderationActions, moderationReports, user } = await import("../../src/database/schemas");
  const { and, eq } = await import("drizzle-orm");
  const db = getDrizzle();
  const postId = randomUUID();
  const commentId = randomUUID();
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, SEED_EMAIL)).limit(1);
  await db.insert(blogPosts).values({ id: postId, authorId: admin.id, slug: `e2e-mod-${postId.slice(0, 8)}`, status: "PUBLISHED", publishedAt: new Date(Date.now() - 60_000) } as never);
  await db.insert(blogComments).values({ id: commentId, postId, authorId: admin.id, content: "Commentaire <i>à modérer</i>", status: "APPROVED" } as never);
  const statusOf = async () => (await db.select({ status: blogComments.status }).from(blogComments).where(eq(blogComments.id, commentId)))[0]?.status;
  const anonymous = await playwright.request.newContext({ baseURL });
  try {
    const response = await anonymous.post("/_actions/moderation.report", { data: { target: "blog.comment", id: commentId, reason: "spam", description: "<b>pub</b>" }, headers: { "content-type": "application/json", origin: baseURL ?? "" } });
    expect(response.ok()).toBe(true);
    await expect.poll(async () => (await db.select().from(moderationReports).where(eq(moderationReports.targetId, commentId))).length).toBe(1);

    await signInAsAdmin(page);
    await page.goto("/fr/admin/moderation", { waitUntil: "networkidle" });
    const item = page.locator(`[data-moderation-item][data-id="${commentId}"]`);
    await expect(item).toContainText("à modérer");
    await expect(item.locator("i")).toHaveCount(0);
    await item.getByLabel("Motif de la décision").fill("Publicité non sollicitée");
    await item.getByRole("button", { name: "Masquer" }).click();
    await expect.poll(statusOf).toBe("REJECTED");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`[data-moderation-item][data-id="${commentId}"]`)).toHaveCount(0);

    await page.goto("/fr/admin/moderation?status=resolved", { waitUntil: "networkidle" });
    const resolved = page.locator(`[data-moderation-item][data-id="${commentId}"]`);
    await resolved.getByLabel("Motif de la décision").fill("Faux positif après vérification");
    await resolved.getByRole("button", { name: "Rétablir" }).click();
    await expect.poll(statusOf).toBe("APPROVED");
    const history = await db.select({ action: moderationActions.action }).from(moderationActions).where(and(eq(moderationActions.targetId, commentId))).orderBy(moderationActions.createdAt);
    expect(history.map((h) => h.action)).toEqual(["hide", "restore"]);
  } finally {
    await anonymous.dispose();
    await db.delete(moderationReports).where(eq(moderationReports.targetId, commentId));
    await db.delete(moderationActions).where(eq(moderationActions.targetId, commentId));
    await db.delete(blogPosts).where(eq(blogPosts.id, postId));
  }
});
