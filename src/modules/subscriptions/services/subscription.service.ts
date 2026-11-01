/**
 * Service Effect du domaine subscriptions : catalogue (formules, tarifs), souscription (session de
 * paiement récurrente du fournisseur, réglages de paiement du tenant), résiliation / reprise,
 * changement de tarif avec prorata. L'état fait foi chez le fournisseur : les retours d'appel
 * ne mettent à jour que les champs renvoyés, les webhooks (`./webhook.ts`) font le reste.
 */
import { Effect } from "effect";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import { writeSubscriptionState } from "./state";
import { fail } from "@/lib/effect/failure";
import { logAuditEventEffect } from "@/lib/audit";
import { PaymentGateway, clampExpiry, tenantPaymentSettings, UnsupportedAmountError, type ProviderSubscriptionState, type RecurringPrice } from "@/core/payments";
import { isCurrencyCode } from "@/core/money";
import type { CustomerType, SupplyType, TaxCategory } from "@/modules/tax/domain/rules";
import { subscriptionPlans, subscriptionPrices, subscriptions } from "../schema";
import { canCancel, canChangePrice, canResume, isLive, validPrice, type BillingInterval } from "../domain/lifecycle";

export type PlanRow = typeof subscriptionPlans.$inferSelect;
export type PriceRow = typeof subscriptionPrices.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;

export interface PlanInput {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly taxCategory: TaxCategory;
  readonly supplyType: SupplyType;
  readonly active: boolean;
  readonly sortOrder: number;
}

export interface PriceInput {
  readonly currency: string;
  readonly amountMinor: number;
  readonly interval: BillingInterval;
  readonly intervalCount: number;
  readonly trialDays: number;
}

const db = () => getDrizzle();

const one = <T>(rows: readonly T[]): T | null => rows[0] ?? null;

export const planById = (id: string) => dbTry("subscriptions.plan.find", () => db().select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1)).pipe(Effect.map(one));
export const priceById = (id: string) => dbTry("subscriptions.price.find", () => db().select().from(subscriptionPrices).where(eq(subscriptionPrices.id, id)).limit(1)).pipe(Effect.map(one));
export const subscriptionById = (id: string) => dbTry("subscriptions.find", () => db().select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1)).pipe(Effect.map(one));

const requiredPlan = (id: string) => Effect.flatMap(planById(id), (row) => (row ? Effect.succeed(row) : fail("NOT_FOUND", "Formule introuvable.")));
const requiredPrice = (id: string) => Effect.flatMap(priceById(id), (row) => (row ? Effect.succeed(row) : fail("NOT_FOUND", "Tarif introuvable.")));
const requiredSubscription = (id: string) => Effect.flatMap(subscriptionById(id), (row) => (row ? Effect.succeed(row) : fail("NOT_FOUND", "Abonnement introuvable.")));

/** Formules d'un tenant (`null` = plateforme), triées. */
export const plansOf = (organizationId: string | null, onlyActive = false) =>
  dbTry("subscriptions.plans", () => db().select().from(subscriptionPlans)
    .where(and(organizationId === null ? isNull(subscriptionPlans.organizationId) : eq(subscriptionPlans.organizationId, organizationId), onlyActive ? eq(subscriptionPlans.active, true) : undefined))
    .orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.name)));

export const pricesOf = (planId: string, onlyActive = false) =>
  dbTry("subscriptions.prices", () => db().select().from(subscriptionPrices)
    .where(and(eq(subscriptionPrices.planId, planId), onlyActive ? eq(subscriptionPrices.active, true) : undefined))
    .orderBy(asc(subscriptionPrices.amountMinor)));

/** Abonnements d'un tenant, les plus récents d'abord. */
export const subscriptionsOf = (organizationId: string | null, limit = 200) =>
  dbTry("subscriptions.list", () => db().select({ subscription: subscriptions, planName: subscriptionPlans.name }).from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
    .where(organizationId === null ? isNull(subscriptions.organizationId) : eq(subscriptions.organizationId, organizationId))
    .orderBy(desc(subscriptions.createdAt)).limit(limit));

/** Abonnements du compte client (portail) : uniquement les siens. */
export const subscriptionsOfCustomer = (userId: string) =>
  dbTry("subscriptions.customer", () => db().select({ subscription: subscriptions, planName: subscriptionPlans.name, price: subscriptionPrices }).from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
    .innerJoin(subscriptionPrices, eq(subscriptionPrices.id, subscriptions.priceId))
    .where(eq(subscriptions.customerUserId, userId))
    .orderBy(desc(subscriptions.createdAt)).limit(100));

/** Abonnement du client `userId` (`null` si inexistant OU d'autrui : aucune énumération). */
export const ownedSubscription = (userId: string, id: string) =>
  dbTry("subscriptions.owned", () => db().select().from(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.customerUserId, userId))).limit(1)).pipe(Effect.map(one));

const recurringPrice = (plan: PlanRow, price: PriceRow) =>
  Effect.gen(function* () {
    const currency = price.currency.toUpperCase();
    if (!isCurrencyCode(currency)) return yield* new UnsupportedAmountError({ currency, amountMinor: price.amountMinor, reason: "currency" });
    return { amount: { amountMinor: price.amountMinor, currency }, interval: price.interval, intervalCount: price.intervalCount, productName: plan.name.slice(0, 200) } satisfies RecurringPrice;
  });

const applyState = (id: string, state: ProviderSubscriptionState, extra: Partial<SubscriptionRow> = {}) =>
  dbTransaction("subscriptions.state", (tx) =>
    Effect.gen(function* () {
      const [before] = yield* dbTry("subscriptions.state.lock", () => tx.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1).for("update"));
      const patch = { status: state.status, cancelAtPeriodEnd: state.cancelAtPeriodEnd, ...(state.status === "cancelled" ? { cancelledAt: new Date() } : {}), ...extra };
      return (yield* writeSubscriptionState(tx, before!, patch, "subscriptions.state"))!;
    }));

const providerContext = (organizationId: string | null) =>
  Effect.gen(function* () {
    const provider = yield* (yield* PaymentGateway).provider;
    const settings = yield* tenantPaymentSettings(organizationId);
    return { provider, settings };
  });

export interface CheckoutCustomer {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly country: string;
  readonly customerType: CustomerType;
}

export const subscriptionsService = {
  // ─── Catalogue ─────────────────────────────────────────────────────
  createPlan: (input: PlanInput & { readonly organizationId: string | null }, authorId: string) =>
    Effect.gen(function* () {
      const [taken] = yield* dbTry("subscriptions.plan.slug", () => db().select({ id: subscriptionPlans.id }).from(subscriptionPlans)
        .where(and(input.organizationId === null ? isNull(subscriptionPlans.organizationId) : eq(subscriptionPlans.organizationId, input.organizationId), eq(subscriptionPlans.slug, input.slug))).limit(1));
      if (taken) return yield* fail("CONFLICT", "Identifiant de formule déjà utilisé.");
      const [row] = yield* dbTry("subscriptions.plan.create", () => db().insert(subscriptionPlans).values({ ...input, createdBy: authorId }).returning());
      yield* logAuditEventEffect({ userId: authorId, action: "SUBSCRIPTION_PLAN_SAVE", resource: "subscription_plan", resourceId: row!.id, metadata: { slug: input.slug } });
      return row!;
    }),

  updatePlan: (id: string, input: PlanInput, authorId: string) =>
    Effect.gen(function* () {
      const plan = yield* requiredPlan(id);
      if (input.slug !== plan.slug) {
        const [taken] = yield* dbTry("subscriptions.plan.slug", () => db().select({ id: subscriptionPlans.id }).from(subscriptionPlans)
          .where(and(plan.organizationId === null ? isNull(subscriptionPlans.organizationId) : eq(subscriptionPlans.organizationId, plan.organizationId), eq(subscriptionPlans.slug, input.slug))).limit(1));
        if (taken) return yield* fail("CONFLICT", "Identifiant de formule déjà utilisé.");
      }
      const [row] = yield* dbTry("subscriptions.plan.update", () => db().update(subscriptionPlans).set(input).where(eq(subscriptionPlans.id, id)).returning());
      yield* logAuditEventEffect({ userId: authorId, action: "SUBSCRIPTION_PLAN_SAVE", resource: "subscription_plan", resourceId: id, metadata: { slug: input.slug } });
      return row!;
    }),

  /** Nouveau tarif (immuable ensuite : un abonnement en cours garde son tarif ; seul l'état actif change). */
  createPrice: (planId: string, input: PriceInput, authorId: string) =>
    Effect.gen(function* () {
      const plan = yield* requiredPlan(planId);
      const currency = input.currency.toUpperCase();
      if (!validPrice({ ...input, currency }) || !isCurrencyCode(currency)) return yield* fail("BAD_REQUEST", "Tarif invalide.");
      const [row] = yield* dbTry("subscriptions.price.create", () => db().insert(subscriptionPrices).values({ ...input, currency, planId, organizationId: plan.organizationId }).returning());
      yield* logAuditEventEffect({ userId: authorId, action: "SUBSCRIPTION_PRICE_SAVE", resource: "subscription_price", resourceId: row!.id, metadata: { planId, amountMinor: input.amountMinor, currency } });
      return row!;
    }),

  setPriceActive: (id: string, active: boolean, authorId: string) =>
    Effect.gen(function* () {
      yield* requiredPrice(id);
      const [row] = yield* dbTry("subscriptions.price.active", () => db().update(subscriptionPrices).set({ active }).where(eq(subscriptionPrices.id, id)).returning());
      yield* logAuditEventEffect({ userId: authorId, action: "SUBSCRIPTION_PRICE_SAVE", resource: "subscription_price", resourceId: id, metadata: { active } });
      return row!;
    }),

  // ─── Souscription ──────────────────────────────────────────────────
  /**
   * Abonnement `incomplete` + session de paiement récurrente du fournisseur (compte connecté,
   * libellé de relevé et durée de validité du tenant). Refus si le client a déjà un abonnement
   * vivant à la même formule.
   */
  startCheckout: (priceId: string, customer: CheckoutCustomer, urls: { readonly successUrl: string; readonly cancelUrl: string }, now: Date = new Date()) =>
    Effect.gen(function* () {
      const price = yield* priceById(priceId);
      const plan = price ? yield* planById(price.planId) : null;
      if (!price || !plan || !price.active || !plan.active) return yield* fail("NOT_FOUND", "Tarif introuvable.");
      const existing = yield* dbTry("subscriptions.checkout.existing", () => db().select({ status: subscriptions.status }).from(subscriptions)
        .where(and(eq(subscriptions.customerUserId, customer.userId), eq(subscriptions.planId, plan.id))));
      if (existing.some((row) => isLive(row.status))) return yield* fail("CONFLICT", "Abonnement déjà actif pour cette formule.");
      const recurring = yield* recurringPrice(plan, price);
      const { provider, settings } = yield* providerContext(plan.organizationId);
      const [row] = yield* dbTry("subscriptions.checkout.create", () => db().insert(subscriptions).values({
        organizationId: plan.organizationId, planId: plan.id, priceId: price.id, customerUserId: customer.userId, customerEmail: customer.email,
        customerName: customer.name, customerCountry: customer.country.toUpperCase(), customerType: customer.customerType, provider: provider.name,
      }).returning());
      const session = yield* provider.createSubscriptionCheckout({
        subscriptionId: row!.id, price: recurring, customerEmail: customer.email, successUrl: urls.successUrl, cancelUrl: urls.cancelUrl,
        expiresAt: clampExpiry(now, undefined, settings.checkoutExpiryMinutes), accountId: settings.accountId, statementDescriptor: settings.statementDescriptor,
      });
      yield* dbTry("subscriptions.checkout.session", () => db().update(subscriptions).set({ checkoutSessionId: session.sessionId }).where(eq(subscriptions.id, row!.id)));
      yield* logAuditEventEffect({ userId: customer.userId, action: "SUBSCRIPTION_CHECKOUT", resource: "subscription", resourceId: row!.id, metadata: { planId: plan.id, priceId: price.id, provider: provider.name } });
      return { subscriptionId: row!.id, url: session.url };
    }),

  // ─── Cycle de vie ──────────────────────────────────────────────────
  /** Résiliation en fin de période (réversible jusqu'à l'échéance). */
  cancel: (id: string, actorId: string) =>
    Effect.gen(function* () {
      const sub = yield* requiredSubscription(id);
      if (!canCancel(sub)) return yield* fail("BAD_REQUEST", "Abonnement non résiliable.");
      const { provider, settings } = yield* providerContext(sub.organizationId);
      const state = yield* provider.cancelSubscription({ providerSubscriptionId: sub.providerSubscriptionId!, atPeriodEnd: true, idempotencyKey: `sub-cancel:${sub.id}:${Date.now()}`, accountId: settings.accountId });
      const row = yield* applyState(sub.id, state);
      yield* logAuditEventEffect({ userId: actorId, action: "SUBSCRIPTION_CANCEL", resource: "subscription", resourceId: sub.id, metadata: { atPeriodEnd: true } });
      return row;
    }),

  /** Annule une résiliation programmée. */
  resume: (id: string, actorId: string) =>
    Effect.gen(function* () {
      const sub = yield* requiredSubscription(id);
      if (!canResume(sub)) return yield* fail("BAD_REQUEST", "Abonnement sans résiliation programmée.");
      const { provider, settings } = yield* providerContext(sub.organizationId);
      const state = yield* provider.resumeSubscription({ providerSubscriptionId: sub.providerSubscriptionId!, idempotencyKey: `sub-resume:${sub.id}:${Date.now()}`, accountId: settings.accountId });
      const row = yield* applyState(sub.id, state);
      yield* logAuditEventEffect({ userId: actorId, action: "SUBSCRIPTION_RESUME", resource: "subscription", resourceId: sub.id });
      return row;
    }),

  /** Changement de tarif (même formule ou autre) ; prorata facturé par le fournisseur à la prochaine échéance. */
  changePrice: (id: string, priceId: string, prorate: boolean, actorId: string) =>
    Effect.gen(function* () {
      const sub = yield* requiredSubscription(id);
      if (!canChangePrice(sub)) return yield* fail("BAD_REQUEST", "Tarif non modifiable pour cet abonnement.");
      if (priceId === sub.priceId) return yield* fail("BAD_REQUEST", "Tarif identique.");
      const price = yield* requiredPrice(priceId);
      const plan = yield* requiredPlan(price.planId);
      if (!price.active || !plan.active || plan.organizationId !== sub.organizationId) return yield* fail("BAD_REQUEST", "Tarif indisponible.");
      const recurring = yield* recurringPrice(plan, price);
      const { provider, settings } = yield* providerContext(sub.organizationId);
      const state = yield* provider.changeSubscriptionPrice({
        subscriptionId: sub.id, providerSubscriptionId: sub.providerSubscriptionId!, providerItemId: sub.providerItemId!, providerProductId: sub.providerProductId!,
        price: recurring, prorate, idempotencyKey: `sub-price:${sub.id}:${price.id}:${Date.now()}`, accountId: settings.accountId,
      });
      const row = yield* applyState(sub.id, state, { priceId: price.id, planId: plan.id });
      yield* logAuditEventEffect({ userId: actorId, action: "SUBSCRIPTION_CHANGE_PRICE", resource: "subscription", resourceId: sub.id, metadata: { from: sub.priceId, to: price.id, prorate } });
      return row;
    }),

  // ─── Portail client (propriété contrôlée : d'autrui ⇒ NOT_FOUND) ───
  cancelOwned: (userId: string, id: string) =>
    Effect.flatMap(ownedSubscription(userId, id), (sub) => (sub ? subscriptionsService.cancel(sub.id, userId) : fail("NOT_FOUND", "Abonnement introuvable."))),
  resumeOwned: (userId: string, id: string) =>
    Effect.flatMap(ownedSubscription(userId, id), (sub) => (sub ? subscriptionsService.resume(sub.id, userId) : fail("NOT_FOUND", "Abonnement introuvable."))),
};
