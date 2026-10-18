import type { PaymentStatus } from "@database/schemas/payments.schema";

// Machine d'états reprise d'atlaselle (simplifiée : pas d'autorisation différée).
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: ["pending", "cancelled", "paid", "failed"],
  pending: ["paid", "failed", "cancelled"],
  paid: ["refunded"],
  failed: ["pending"],
  cancelled: [],
  refunded: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransitionPayment(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new Error(`Transition de paiement refusée : ${from} → ${to}`);
  }
}
