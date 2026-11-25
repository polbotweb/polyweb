/**
 * Versements Stripe (payouts), purs : un versement reçu en banque est net des commissions et des
 * remboursements. Les transactions de solde (`balance_transactions?payout=…`) sont ventilées en
 * encaissements bruts, remboursements, commissions et ajustements pour le rapprochement et l'écriture.
 */
import type { PayoutItemType } from "./constants";

export interface PayoutItem {
  readonly externalId: string;
  readonly type: PayoutItemType;
  /** Montant brut (signé, unités mineures). */
  readonly amountMinor: number;
  readonly feeMinor: number;
  readonly netMinor: number;
  /** Objet source (`ch_…`, `pi_…`, `re_…`) pour retrouver le paiement core/payments. */
  readonly sourceId: string | null;
}

export interface PayoutBreakdown {
  readonly grossMinor: number;
  readonly refundMinor: number;
  readonly feeMinor: number;
  readonly adjustmentMinor: number;
  readonly netMinor: number;
}

/** Type Stripe d'une transaction de solde → type de ligne de versement. */
export const stripeItemType = (type: string): PayoutItemType => {
  if (type === "charge" || type === "payment") return "charge";
  if (type === "refund" || type === "payment_refund" || type === "payment_failure_refund") return "refund";
  if (type === "stripe_fee" || type === "application_fee" || type === "tax_fee") return "fee";
  if (type === "adjustment" || type === "dispute" || type === "reserve_transaction") return "adjustment";
  return "other";
};

/** Ventilation d'un versement ; la transaction de type `payout` elle-même est exclue. */
export const breakdown = (items: readonly PayoutItem[]): PayoutBreakdown => {
  let gross = 0, refund = 0, fee = 0, adjustment = 0, net = 0;
  for (const item of items) {
    fee += item.feeMinor;
    net += item.netMinor;
    if (item.type === "charge") gross += item.amountMinor;
    else if (item.type === "refund") refund += item.amountMinor;
    else if (item.type === "fee") fee += -item.amountMinor;
    else adjustment += item.amountMinor;
  }
  return { grossMinor: gross, refundMinor: refund, feeMinor: fee, adjustmentMinor: adjustment, netMinor: net };
};
