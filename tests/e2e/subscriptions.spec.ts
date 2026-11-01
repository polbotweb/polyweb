/**
 * Abonnements : création d'une formule et d'un tarif depuis l'admin, catalogue public, portail client
 * (liste du compte) et refus IDOR (404) des actions portail sur l'abonnement d'un autre client.
 * Aucun appel au fournisseur de paiement : les abonnements sont insérés directement.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";
import { SEED_EMAIL } from "./global-setup";

test("abonnements : formule et tarif admin, catalogue public, portail et IDOR", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours abonnements : Chromium");
  test.setTimeout(90_000);
  const { getDrizzle, schema } = await import("../../src/database/drizzle");
  const { subscriptionPlans, subscriptions } = await import("../../src/modules/subscriptions/schema");
  const { eq } = await import("drizzle-orm");
  const db = getDrizzle();
  const tag = randomUUID().slice(0, 8);
  const slug = `e2e-plan-${tag}`;
  const otherId = `e2e-subs-other-${tag}`;
  const [me] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, SEED_EMAIL)).limit(1);
  try {
    await db.insert(schema.user).values({ id: otherId, name: "Autre client", email: `${otherId}@test.local`, emailVerified: true });

    // Sans session : les actions portail répondent 401.
    await page.goto("/fr/subscriptions", { waitUntil: "networkidle" });
    const anonymous = await page.request.post(`/fr/account/subscriptions/${randomUUID()}/cancel`, { maxRedirects: 0, headers: { Origin: new URL(page.url()).origin } });
    expect(anonymous.status()).toBe(401);

    await signInAsAdmin(page);
    await page.goto("/fr/admin/subscriptions", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Abonnements");
    await page.locator("summary", { hasText: "Nouvelle formule" }).click();
    const form = page.getByTestId("sub-plan-new");
    await form.getByLabel("Nom").fill(`Formule e2e ${tag}`);
    await form.getByLabel("Identifiant (slug)").fill(slug);
    await form.getByRole("button", { name: "Créer" }).click();
    await page.waitForURL(/\/fr\/admin\/subscriptions\/plans\/[^/]+$/);
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, slug));
    expect(plan?.organizationId).toBeNull();

    const priceForm = page.getByTestId("sub-price-new");
    await priceForm.getByLabel("Montant TTC").fill("9.90");
    await priceForm.getByRole("button", { name: "Nouveau tarif" }).click();
    await expect(page.getByRole("table").getByText("9,90")).toBeVisible();

    await page.goto("/fr/subscriptions", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 2, name: `Formule e2e ${tag}` })).toBeVisible();

    const { subscriptionPrices } = await import("../../src/modules/subscriptions/schema");
    const [price] = await db.select().from(subscriptionPrices).where(eq(subscriptionPrices.planId, plan!.id));
    const base = { planId: plan!.id, priceId: price!.id, customerCountry: "FR", status: "active" as const, provider: "stripe", currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000) };
    await db.insert(subscriptions).values({ ...base, customerUserId: me!.id, customerEmail: SEED_EMAIL, customerName: "Moi", providerSubscriptionId: `sub_e2e_mine_${tag}` });
    const [theirs] = await db.insert(subscriptions).values({ ...base, customerUserId: otherId, customerEmail: `${otherId}@test.local`, customerName: "Autre", providerSubscriptionId: `sub_e2e_other_${tag}` }).returning();

    await page.goto("/fr/account", { waitUntil: "networkidle" });
    const section = page.getByTestId("portal-subscriptions");
    await expect(section.getByRole("heading", { level: 2 })).toHaveText("Mes abonnements");
    await expect(section.getByTestId("portal-subscription-row")).toHaveCount(1);
    await expect(section.getByRole("button", { name: "Résilier en fin de période" })).toBeVisible();

    // IDOR : l'abonnement d'un autre client est introuvable (404), sans appel au fournisseur.
    const origin = new URL(page.url()).origin;
    for (const op of ["cancel", "resume"]) {
      const response = await page.request.post(`/fr/account/subscriptions/${theirs!.id}/${op}`, { maxRedirects: 0, headers: { Origin: origin } });
      expect(response.status()).toBe(404);
    }
    const [unchanged] = await db.select().from(subscriptions).where(eq(subscriptions.id, theirs!.id));
    expect(unchanged?.cancelAtPeriodEnd).toBe(false);
  } finally {
    const plans = await db.select({ id: subscriptionPlans.id }).from(subscriptionPlans).where(eq(subscriptionPlans.slug, slug));
    for (const { id } of plans) {
      await db.delete(subscriptions).where(eq(subscriptions.planId, id));
      await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, id));
    }
    await db.delete(schema.user).where(eq(schema.user.id, otherId));
  }
});
