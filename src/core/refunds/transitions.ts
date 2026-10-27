/**
 * Règles pures de core/refunds (sans base) : cycle de vie d'un remboursement, reste
 * remboursable et statut du paiement qui en découle.
 *
 *   pending → succeeded | failed | cancelled
 *   failed  → succeeded        (confirmation tardive du fournisseur : l'argent est parti)
 */
import type { PaymentStatus } from '@database/schemas/payments.schema';
import type { RefundStatus } from '@database/schemas/refunds.schema';

const TRANSITIONS: Readonly<Record<RefundStatus, readonly RefundStatus[]>> = {
  pending: ['succeeded', 'failed', 'cancelled'],
  failed: ['succeeded'],
  succeeded: [],
  cancelled: [],
};

export const canTransitionRefund = (from: RefundStatus, to: RefundStatus): boolean => TRANSITIONS[from].includes(to);

/** Statuts qui engagent le plafond (montant réservé ou déjà rendu). */
export const COMMITTED_REFUND_STATUSES = ['pending', 'succeeded'] as const satisfies readonly RefundStatus[];

/** Paiements remboursables. */
export const REFUNDABLE_PAYMENT_STATUSES = ['paid', 'partially_refunded'] as const satisfies readonly PaymentStatus[];

export const isRefundablePayment = (status: PaymentStatus): boolean => (REFUNDABLE_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(status);

/** Reste remboursable : capturé − (remboursé + en cours), jamais négatif. */
export const refundableRemainder = (captured: number, refunds: readonly { readonly status: RefundStatus; readonly amount: number }[]): number => {
  const committed = refunds.filter((r) => (COMMITTED_REFUND_STATUSES as readonly RefundStatus[]).includes(r.status)).reduce((total, r) => total + r.amount, 0);
  return Math.max(0, captured - committed);
};

/** Statut du paiement après remboursements réussis (`succeededTotal` ≥ capturé → `refunded`). */
export const paymentStatusAfterRefunds = (captured: number, succeededTotal: number): PaymentStatus =>
  succeededTotal <= 0 ? 'paid' : succeededTotal >= captured ? 'refunded' : 'partially_refunded';
