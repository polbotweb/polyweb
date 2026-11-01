/** Adaptateurs Promise (pages Astro) des lectures du module subscriptions. */
import { runOrThrow } from "@/lib/effect/run";
import { planById, plansOf, pricesOf, subscriptionById, subscriptionsOf, subscriptionsOfCustomer } from "../services/subscription.service";

export const loadPlans = (organizationId: string | null, onlyActive = false) => runOrThrow(plansOf(organizationId, onlyActive));
export const loadPlan = (id: string) => runOrThrow(planById(id));
export const loadPrices = (planId: string, onlyActive = false) => runOrThrow(pricesOf(planId, onlyActive));
export const loadSubscriptions = (organizationId: string | null) => runOrThrow(subscriptionsOf(organizationId));
export const loadSubscription = (id: string) => runOrThrow(subscriptionById(id));
/** Abonnements du client hors souscriptions abandonnées (`incomplete`). */
export const loadCustomerSubscriptions = async (userId: string) => (await runOrThrow(subscriptionsOfCustomer(userId))).filter((row) => row.subscription.status !== "incomplete");

/** Catalogue public : formules actives et leurs tarifs actifs (formules sans tarif masquées). */
export const loadPublicCatalog = async (organizationId: string | null) => {
  const plans = await loadPlans(organizationId, true);
  const withPrices = await Promise.all(plans.map(async (plan) => ({ plan, prices: await loadPrices(plan.id, true) })));
  return withPrices.filter((entry) => entry.prices.length > 0);
};
