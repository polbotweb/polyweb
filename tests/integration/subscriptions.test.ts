/**
 * Module subscriptions sur base réelle (fournisseur mock, aucun appel Stripe) : récepteur d'événements
 * (rattachement, doublon `payment_events`, facture Sales payée / impayée par facture fournisseur,
 * résiliation, abonnement inconnu), services admin et propriété client (IDOR).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Effect } from "effect";
import { eq, inArray } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { user } from "@database/schemas";
import { sales, salesPayments } from "@/modules/sales/schema";
import { appRuntime } from "@/lib/effect/runtime";
import { makeMockProvider, type VerifiedPaymentEvent, type VerifiedSubscriptionEvent } from "@/core/payments";
import { subscriptionPlans, subscriptionPrices, subscriptions } from "@/modules/subscriptions/schema";
import { handleSubscriptionEvent } from "@/modules/subscriptions/services/webhook";
import { ownedSubscription, subscriptionsOfCustomer, subscriptionsService } from "@/modules/subscriptions/services/subscription.service";

const db = getDrizzle();
const t = `sb-${Date.now().toString(36)}`;
const owner = `${t}-owner`;
const other = `${t}-other`;
const provider = makeMockProvider("itest-mock-secret");
const run = <A, E>(e: Effect.Effect<A, E, never>) => appRuntime.runPromise(e);
let planId = "";
let priceId = "";
let subId = "";
let counter = 0;

const event = (sub: Partial<VerifiedSubscriptionEvent> & Pick<VerifiedSubscriptionEvent, "action">, eventId = `${t}-evt-${++counter}`): VerifiedPaymentEvent => ({
  provider: "mock", eventId, type: `customer.subscription.${sub.action}`, kind: "subscription", paymentId: null, providerPaymentId: null, sessionId: null, amount: null,
  subscription: {
    subscriptionId: null, providerSubscriptionId: `${t}-psub`, providerCustomerId: null, providerItemId: null, providerProductId: null,
    status: null, cancelAtPeriodEnd: null, currentPeriodEnd: null, invoice: null, ...sub,
  },
});
const invoice = (id: string, amountMinor: number) => ({
  providerInvoiceId: `${t}-${id}`, amount: { amountMinor, currency: "EUR" as const }, periodStart: new Date("2026-10-01T00:00:00Z"), periodEnd: new Date("2026-11-01T00:00:00Z"), attempt: 1, nextAttemptAt: null,
});
const row = async () => (await db.select().from(subscriptions).where(eq(subscriptions.id, subId)))[0]!;

beforeAll(async () => {
  await db.insert(user).values([{ id: owner, name: "Owner", email: `${owner}@test.local`, emailVerified: true }, { id: other, name: "Other", email: `${other}@test.local`, emailVerified: true }]);
  const plan = await run(subscriptionsService.createPlan({ organizationId: null, slug: `${t}-plan`, name: `Formule ${t}`, description: null, taxCategory: "standard", supplyType: "services", active: true, sortOrder: 0 }, owner));
  planId = plan.id;
  const price = await run(subscriptionsService.createPrice(planId, { currency: "EUR", amountMinor: 1200, interval: "month", intervalCount: 1, trialDays: 0 }, owner));
  priceId = price.id;
  const [sub] = await db.insert(subscriptions).values({ planId, priceId, customerUserId: owner, customerEmail: `${owner}@test.local`, customerName: "Owner", customerCountry: "FR", provider: "mock" }).returning();
  subId = sub!.id;
});

afterAll(async () => {
  const docs = await db.select({ id: sales.id }).from(sales).where(inArray(sales.providerInvoiceId, [`${t}-in-paid`, `${t}-in-failed`]));
  if (docs.length) {
    await db.delete(salesPayments).where(inArray(salesPayments.documentId, docs.map((d) => d.id)));
    await db.delete(sales).where(inArray(sales.id, docs.map((d) => d.id)));
  }
  await db.delete(subscriptions).where(eq(subscriptions.planId, planId));
  await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
  await db.delete(user).where(inArray(user.id, [owner, other]));
});

describe("services", () => {
  it("refuse un tarif invalide et liste les tarifs de la formule", async () => {
    await expect(run(subscriptionsService.createPrice(planId, { currency: "EUR", amountMinor: 0, interval: "month", intervalCount: 1, trialDays: 0 }, owner))).rejects.toBeTruthy();
    const prices = await db.select().from(subscriptionPrices).where(eq(subscriptionPrices.planId, planId));
    expect(prices).toHaveLength(1);
  });
  it("propriété client : l'abonnement d'autrui est introuvable", async () => {
    expect((await run(ownedSubscription(owner, subId)))?.id).toBe(subId);
    expect(await run(ownedSubscription(other, subId))).toBeNull();
    expect(await run(subscriptionsOfCustomer(other))).toHaveLength(0);
  });
});

describe("récepteur d'événements", () => {
  it("abonnement inconnu : unmatched", async () => {
    const outcome = await run(handleSubscriptionEvent(provider, event({ action: "updated", providerSubscriptionId: `${t}-nope` })));
    expect(outcome).toBe("unmatched");
  });

  it("création : rattachement par métadonnée, puis doublon ignoré", async () => {
    const created = event({ action: "created", subscriptionId: subId, status: "active", providerItemId: "si_1", providerProductId: "prod_1", currentPeriodEnd: new Date("2026-12-01T00:00:00Z") }, `${t}-created`);
    expect(await run(handleSubscriptionEvent(provider, created))).toBe("applied");
    const linked = await row();
    expect(linked).toMatchObject({ providerSubscriptionId: `${t}-psub`, status: "active", providerItemId: "si_1", providerProductId: "prod_1" });
    expect(await run(handleSubscriptionEvent(provider, created))).toBe("duplicate");
  });

  it("métadonnée incohérente (autre abonnement fournisseur) : non rattachée", async () => {
    const outcome = await run(handleSubscriptionEvent(provider, event({ action: "updated", subscriptionId: subId, providerSubscriptionId: `${t}-psub-2`, status: "cancelled" })));
    expect(outcome).toBe("unmatched");
    expect((await row()).status).toBe("active");
  });

  it("facture payée : facture Sales émise et soldée, référence fournisseur", async () => {
    expect(await run(handleSubscriptionEvent(provider, event({ action: "invoice_paid", invoice: invoice("in-paid", 1200) })))).toBe("applied");
    const [doc] = await db.select().from(sales).where(eq(sales.providerInvoiceId, `${t}-in-paid`));
    expect(doc?.status).toBe("PAID");
    expect(doc?.organizationId).toBeNull();
    // Rejeu de la même facture sous un autre événement : aucune seconde facture Sales.
    await run(handleSubscriptionEvent(provider, event({ action: "invoice_paid", invoice: invoice("in-paid", 1200) })));
    expect(await db.select().from(sales).where(eq(sales.providerInvoiceId, `${t}-in-paid`))).toHaveLength(1);
  });

  it("échec de prélèvement : facture Sales émise impayée, abonnement past_due", async () => {
    expect(await run(handleSubscriptionEvent(provider, event({ action: "invoice_failed", invoice: invoice("in-failed", 1200) })))).toBe("applied");
    const [doc] = await db.select().from(sales).where(eq(sales.providerInvoiceId, `${t}-in-failed`));
    expect(doc?.status).toBe("ISSUED");
    expect((await row()).status).toBe("past_due");
  });

  it("résiliation programmée puis suppression", async () => {
    await run(handleSubscriptionEvent(provider, event({ action: "updated", status: "active", cancelAtPeriodEnd: true })));
    expect(await row()).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
    await run(handleSubscriptionEvent(provider, event({ action: "deleted" })));
    const ended = await row();
    expect(ended.status).toBe("cancelled");
    expect(ended.cancelAtPeriodEnd).toBe(false);
    expect(ended.cancelledAt).toBeInstanceOf(Date);
  });
});
