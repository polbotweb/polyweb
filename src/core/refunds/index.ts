/** core/refunds — remboursements génériques (plafond, idempotence, webhooks, réactions des modules). Voir docs/refunds.md. */
import { setRefundEventSink } from '@/core/payments';
import { applyRefundEvent } from './service';

export * from './errors';
export * from './registry';
export * from './transitions';
export * from './service';

let wired = false;

/** Branche les événements `refund` de core/payments sur core/refunds (bootstrap, idempotent). */
export const registerRefundsCore = (): void => {
  if (wired) return;
  setRefundEventSink((provider, event) => applyRefundEvent(provider, event));
  wired = true;
};
