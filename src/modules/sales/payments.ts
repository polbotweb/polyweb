/**
 * Paiement en ligne d'une facture via core/payments (objet `sales-invoice`, référence `sales-invoice:<id>`).
 *
 * - Lien de paiement signé (HMAC lié à la facture, `signingSecret`) envoyé au client ; la page
 *   publique ne crée la session fournisseur que sur POST (les scanners de liens n'en créent pas).
 * - Montant demandé = restant dû (encaissements et avoirs déduits), devise de la facture.
 * - Payé (webhook vérifié) → encaissement `card` (référence fournisseur) et statut recalculé,
 *   dans la transaction du webhook. Facture déjà soldée / trop-perçu : journalisé, à rembourser
 *   par l'administration ; le webhook n'échoue jamais pour une règle métier.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { getDrizzle } from '@database/drizzle';
import type { Payment } from '@database/schemas/payments.schema';
import { isCurrencyCode } from '@/core/money';
import { registerPaymentPurpose, startCheckout, UnsupportedAmountError } from '@/core/payments';
import { AppConfig } from '@/lib/effect/config';
import { dbTry } from '@/lib/effect/run';
import type { DbTransaction } from '@/lib/effect/transaction';
import { sales, salesPayments } from './schema';
import { amountDue, invoiceStatusFromBalance, validatePayment } from './domain/payments';

export const SALES_PAYMENT_PURPOSE = 'sales-invoice';

type InvoiceRow = typeof sales.$inferSelect;

// ─── Lien signé ──────────────────────────────────────────────────────
const mac = (secret: string, invoiceId: string) => createHmac('sha256', `polyweb:sales-pay:${secret}`).update(invoiceId).digest('base64url').slice(0, 32);

/** Jeton du lien de paiement (HMAC-SHA256 tronqué, 192 bits) lié à la facture. */
export const payLinkToken = (secret: string, invoiceId: string) => mac(secret, invoiceId);

/** Comparaison à temps constant. */
export const verifyPayLinkToken = (secret: string, invoiceId: string, token: string | null | undefined) => {
  if (!token || token.length !== 32) return false;
  const expected = Buffer.from(mac(secret, invoiceId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
};

/** Chemin public du lien de paiement (à préfixer de `siteUrl`). */
export const payLinkPath = (locale: string, invoiceId: string, token: string) => `/${locale}/pay/invoice/${encodeURIComponent(invoiceId)}?t=${encodeURIComponent(token)}`;

/** URL absolue du lien de paiement (`siteUrl` + jeton signé). */
export const payLinkUrl = (locale: string, invoiceId: string) =>
  Effect.map(AppConfig, (config) => `${config.siteUrl}${payLinkPath(locale, invoiceId, payLinkToken(config.signingSecret, invoiceId))}`);

/** Facture payable en ligne : émise, non soldée. */
export const isPayableInvoice = (invoice: Pick<InvoiceRow, 'kind' | 'status' | 'grossMinor' | 'paidMinor' | 'creditedMinor'>) =>
  invoice.kind === 'invoice' && (invoice.status === 'ISSUED' || invoice.status === 'PARTIALLY_PAID') && amountDue(invoice) > 0;

/** Facture d'un lien signé (`null` si lien invalide ou document non facture). */
export const invoiceForPayLink = (secret: string, invoiceId: string, token: string | null | undefined) =>
  Effect.gen(function* () {
    if (!verifyPayLinkToken(secret, invoiceId, token)) return null;
    const [row] = yield* dbTry('sales.payLink.find', () => getDrizzle().select().from(sales).where(eq(sales.id, invoiceId)).limit(1));
    return row && row.kind === 'invoice' ? row : null;
  });

/** Session de paiement hébergée pour le restant dû (réutilisée tant qu'elle est valable). */
export const startInvoiceCheckout = (invoice: InvoiceRow, urls: { readonly successUrl: string; readonly cancelUrl: string }, now: Date = new Date()) =>
  Effect.gen(function* () {
    const currency = invoice.currency.toUpperCase();
    const due = amountDue(invoice);
    if (!isCurrencyCode(currency)) return yield* new UnsupportedAmountError({ currency, amountMinor: due, reason: 'currency' });
    return yield* startCheckout({
      organizationId: invoice.organizationId, purpose: SALES_PAYMENT_PURPOSE, subjectId: invoice.id,
      amount: { amountMinor: due, currency }, description: `Facture ${invoice.number ?? invoice.slug}`.slice(0, 200),
      customerEmail: invoice.customerEmail, successUrl: urls.successUrl, cancelUrl: urls.cancelUrl, metadata: { invoiceId: invoice.id }, now,
    });
  });

// ─── Réaction au paiement ────────────────────────────────────────────
const recordCardPayment = (tx: DbTransaction, payment: Payment, invoiceId: string) =>
  Effect.gen(function* () {
    const [invoice] = yield* dbTry('sales.payLink.lock', () => tx.select().from(sales).where(eq(sales.id, invoiceId)).limit(1).for('update'));
    if (!invoice || invoice.kind !== 'invoice') return yield* Effect.logError('[sales] paiement en ligne sur un document inconnu', { paymentId: payment.id });
    const reference = payment.providerPaymentId ?? payment.id;
    const [already] = yield* dbTry('sales.payLink.dedupe', () => tx.select({ id: salesPayments.id }).from(salesPayments).where(and(eq(salesPayments.documentId, invoiceId), eq(salesPayments.method, 'card'), eq(salesPayments.reference, reference))).limit(1));
    if (already) return;
    if (invoice.currency.toUpperCase() !== payment.currency) {
      return yield* Effect.logError('[sales] devise du paiement différente de la facture — remboursement à traiter', { invoiceId, paymentId: payment.id });
    }
    const balance = { grossMinor: invoice.grossMinor, paidMinor: invoice.paidMinor, creditedMinor: invoice.creditedMinor };
    const valid = yield* Effect.result(validatePayment(invoice.status, balance, payment.amount));
    if (valid._tag === 'Failure') {
      return yield* Effect.logError('[sales] paiement en ligne non imputable (facture soldée ou trop-perçu) — remboursement à traiter', { invoiceId, paymentId: payment.id, reason: valid.failure.reason });
    }
    const paidAt = (payment.paidAt ?? new Date()).toISOString().slice(0, 10);
    yield* dbTry('sales.payLink.insert', () => tx.insert(salesPayments).values({
      documentId: invoice.id, organizationId: invoice.organizationId, amountMinor: payment.amount, currency: invoice.currency, method: 'card', paidAt, reference, createdBy: null,
    }));
    const paidMinor = invoice.paidMinor + payment.amount;
    yield* dbTry('sales.payLink.apply', () => tx.update(sales).set({ paidMinor, status: invoiceStatusFromBalance({ ...balance, paidMinor }) }).where(eq(sales.id, invoice.id)));
  });

export const registerSalesPayments = () => registerPaymentPurpose({ purpose: SALES_PAYMENT_PURPOSE, onSucceeded: recordCardPayment });
