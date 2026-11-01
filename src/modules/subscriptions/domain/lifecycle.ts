/**
 * Cycle de vie d'un abonnement (pur, testable sans base) : statuts, transitions autorisées côté
 * client / back-office, validation des tarifs. L'état fait foi chez le fournisseur : les webhooks
 * appliquent `applyProviderState`, les actions locales ne font que demander un changement.
 */
import type { ProviderSubscriptionStatus, SubscriptionInterval } from "@/core/payments/provider";

export const SUBSCRIPTION_STATUSES = ["incomplete", "trialing", "active", "past_due", "cancelled", "unpaid", "paused"] as const satisfies readonly ProviderSubscriptionStatus[];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const BILLING_INTERVALS = ["day", "week", "month", "year"] as const satisfies readonly SubscriptionInterval[];
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Abonnement encore lié à un abonnement fournisseur actif (résiliable, modifiable). */
export const isLive = (status: SubscriptionStatus) => status === "trialing" || status === "active" || status === "past_due" || status === "unpaid" || status === "paused";

interface CancellableShape { readonly status: SubscriptionStatus; readonly cancelAtPeriodEnd: boolean; readonly providerSubscriptionId: string | null }

/** Résiliation en fin de période possible : abonnement vivant, non déjà programmé. */
export const canCancel = (s: CancellableShape) => s.providerSubscriptionId !== null && isLive(s.status) && !s.cancelAtPeriodEnd;
/** Reprise possible : résiliation programmée, abonnement encore vivant. */
export const canResume = (s: CancellableShape) => s.providerSubscriptionId !== null && isLive(s.status) && s.cancelAtPeriodEnd;
/** Changement de tarif possible : abonnement vivant avec article fournisseur connu. */
export const canChangePrice = (s: CancellableShape & { readonly providerItemId: string | null; readonly providerProductId: string | null }) =>
  s.providerSubscriptionId !== null && s.providerItemId !== null && s.providerProductId !== null && isLive(s.status) && s.status !== "paused";

/** Tarif valide : montant > 0 et ≤ 10^10, période 1–12, essai 0–730 jours, devise ISO 4217. */
export const validPrice = (p: { readonly amountMinor: number; readonly intervalCount: number; readonly trialDays: number; readonly currency: string }) =>
  Number.isSafeInteger(p.amountMinor) && p.amountMinor > 0 && p.amountMinor <= 10_000_000_000
  && Number.isInteger(p.intervalCount) && p.intervalCount >= 1 && p.intervalCount <= 12
  && Number.isInteger(p.trialDays) && p.trialDays >= 0 && p.trialDays <= 730
  && /^[A-Z]{3}$/.test(p.currency);

/** Champs locaux mis à jour par un événement fournisseur (seules les valeurs connues écrasent). */
export const providerPatch = (event: {
  readonly status: ProviderSubscriptionStatus | null; readonly cancelAtPeriodEnd: boolean | null; readonly currentPeriodEnd: Date | null;
  readonly providerSubscriptionId: string; readonly providerCustomerId: string | null; readonly providerItemId: string | null; readonly providerProductId: string | null;
}, now: Date, deleted: boolean) => {
  const status: SubscriptionStatus | null = deleted ? "cancelled" : event.status;
  return {
    providerSubscriptionId: event.providerSubscriptionId,
    ...(status ? { status } : {}),
    ...(event.cancelAtPeriodEnd !== null ? { cancelAtPeriodEnd: event.cancelAtPeriodEnd } : {}),
    ...(event.currentPeriodEnd ? { currentPeriodEnd: event.currentPeriodEnd } : {}),
    ...(event.providerCustomerId ? { providerCustomerId: event.providerCustomerId } : {}),
    ...(event.providerItemId ? { providerItemId: event.providerItemId } : {}),
    ...(event.providerProductId ? { providerProductId: event.providerProductId } : {}),
    ...(status === "cancelled" ? { cancelledAt: now, cancelAtPeriodEnd: false } : {}),
  };
};
