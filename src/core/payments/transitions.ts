/**
 * Machine d'états d'un paiement (core/payments).
 *
 *   created → pending → paid → partially_refunded → refunded   (core/refunds)
 *                    ↘ failed ⇄ pending
 *                    ↘ expired / cancelled
 *
 * `expired → paid` et `failed → paid` restent permis : un encaissement confirmé par le
 * fournisseur (fonds prélevés) est toujours enregistré, même après l'échéance locale.
 */
import type { PaymentStatus } from '@database/schemas/payments.schema';

export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  created: ['pending', 'cancelled', 'paid', 'failed', 'expired'],
  pending: ['paid', 'failed', 'cancelled', 'expired'],
  paid: ['partially_refunded', 'refunded'],
  partially_refunded: ['refunded'],
  failed: ['pending', 'paid', 'expired'],
  cancelled: [],
  refunded: [],
  expired: ['paid'],
};

export const canTransitionPayment = (from: PaymentStatus, to: PaymentStatus): boolean => PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;

export function assertTransitionPayment(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) throw new Error(`Transition de paiement refusée : ${from} → ${to}`);
}
