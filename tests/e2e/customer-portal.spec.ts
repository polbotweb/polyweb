/**
 * Portail client : la page /account liste les documents du compte connecté, et les routes d'action
 * refusent (404, comme un identifiant inexistant) les identifiants d'un autre client — IDOR.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin";
import { SEED_EMAIL } from "./global-setup";

test("portail client : liste du compte, IDOR sur factures/commandes/réservations", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Parcours portail : Chromium");
  test.setTimeout(90_000);
  const { getDrizzle, schema } = await import("../../src/database/drizzle");
  const { appRuntime } = await import("../../src/lib/effect/runtime");
  const { salesService } = await import("../../src/modules/sales/services/salesDocument.service");
  const { orders } = await import("../../src/modules/shop/schema/orders");
  const { sales } = await import("../../src/modules/sales/schema");
  const { eq } = await import("drizzle-orm");
  const db = getDrizzle();
  const tag = randomUUID().slice(0, 8);
  const orgId = `e2e-portal-${tag}`;
  const otherId = `e2e-portal-other-${tag}`;
  const otherEmail = `${otherId}@test.local`;
  const day = "2026-03-02";
  const [me] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, SEED_EMAIL)).limit(1);
  const invoice = async (email: string, title: string) => {
    const doc = await appRuntime.runPromise(salesService.create({
      kind: "invoice", organizationId: orgId, title, customerName: "Client", customerEmail: email, customerCountry: "FR", customerType: "B2C",
      sellerCountry: "FR", supplyType: "services", currency: "EUR", paymentTermDays: 30, lines: [{ description: "Prestation", quantity: "1", unitPriceMinor: 5000, taxCategory: "standard" }],
    }, me!.id, day));
    return appRuntime.runPromise(salesService.transition(doc.id, "ISSUED", { userId: me!.id, sessionId: null }, "fr", day));
  };
  try {
    await db.insert(schema.user).values({ id: otherId, name: "Autre client", email: otherEmail, emailVerified: true });
    await db.insert(schema.organization).values({ id: orgId, name: `Tenant portail ${tag}`, slug: orgId, createdAt: new Date() });
    const mine = await invoice(SEED_EMAIL.toUpperCase(), `Facture e2e ${tag}`);
    const theirs = await invoice(otherEmail, `Facture autre ${tag}`);
    const [theirOrder] = await db.insert(orders).values({
      organizationId: orgId, number: `E2E-${tag}`, status: "PAID", locale: "fr", email: otherEmail, customerName: "Autre", userId: otherId, addressLine1: "1 rue",
      postcode: "75001", city: "Paris", country: "FR", shippingMethod: "standard", shippingMinor: 0, currency: "EUR", netMinor: 0, taxMinor: 0, grossMinor: 0,
      taxTreatment: "domestic", taxBreakdown: [], expiresAt: new Date(Date.now() + 86_400_000),
    }).returning();

    // Sans session : 401, aucune redirection vers un lien signé.
    const anonymous = await page.request.get(`/fr/account/invoices/${mine.id}/pay`, { maxRedirects: 0 });
    expect(anonymous.status()).toBe(401);

    await signInAsAdmin(page);
    await page.goto("/fr/account", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mon espace client");
    const rows = page.getByTestId("portal-invoice-row");
    await expect(rows.filter({ hasText: mine.number! })).toHaveCount(1);
    await expect(rows.filter({ hasText: theirs.number! })).toHaveCount(0);
    await expect(page.getByRole("link", { name: `Télécharger le PDF de ${mine.number}` })).toHaveAttribute("href", `/fr/account/invoices/${mine.id}/pdf`);

    // IDOR : identifiants d'autrui ≡ inexistants (404), sans jeton émis.
    for (const path of [`/fr/account/invoices/${theirs.id}/pay`, `/fr/account/invoices/${theirs.id}/pdf`, `/fr/account/orders/${theirOrder!.id}`, `/fr/account/bookings/${randomUUID()}`, `/fr/account/invoices/${randomUUID()}/pay`]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
      expect(response.headers()["location"], path).toBeUndefined();
    }
    // Sa propre facture : redirection vers le lien de paiement signé.
    const own = await page.request.get(`/fr/account/invoices/${mine.id}/pay`, { maxRedirects: 0 });
    expect(own.status()).toBe(303);
    expect(own.headers()["location"]).toContain(mine.id);
    expect(own.headers()["location"]).toContain("t=");
  } finally {
    await db.delete(orders).where(eq(orders.organizationId, orgId));
    await db.delete(sales).where(eq(sales.organizationId, orgId));
    await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    await db.delete(schema.user).where(eq(schema.user.id, otherId));
  }
});
