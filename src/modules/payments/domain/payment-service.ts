/**
 * Service de paiement générique — création de session de paiement et
 * traitement idempotent des webhooks fournisseur.
 *
 * Inspiré du tunnel atlaselle (signature → idempotence → montants →
 * transaction), sans dépendance au métier voyage.
 */
import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { getDrizzle, type DrizzleDB } from "@database/drizzle";
import { payments, type Payment } from "@database/schemas/payments.schema";
import { emitEvent } from "@/core/events";
import { logAuditEvent } from "@/lib/audit";
import { canTransitionPayment } from "./transitions";
import { selectPaymentProvider, type PaymentProvider, type ProviderWebhookEvent } from "./providers";

export function isPaymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === "true";
}

export interface StartCheckoutInput {
  reference: string;
  amount: number;
  currency?: string;
  description?: string;
  customerEmail?: string | null;
  organizationId?: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, unknown>;
}

export class PaymentAmountMismatchError extends Error {
  constructor(expected: number, received: number, currency: string) {
    super(`Montant incohérent : attendu ${expected} ${currency}, reçu ${received}.`);
    this.name = "PaymentAmountMismatchError";
  }
}

export async function startCheckout(
  input: StartCheckoutInput,
  deps: { db?: DrizzleDB; provider?: PaymentProvider } = {},
): Promise<{ payment: Payment; checkoutUrl: string }> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Le montant doit être un entier positif (centimes).");
  const db = deps.db ?? getDrizzle();
  const provider = deps.provider ?? selectPaymentProvider();
  const currency = (input.currency ?? "EUR").toUpperCase();
  const idempotencyKey = randomUUID();

  const [payment] = await db
    .insert(payments)
    .values({
      reference: input.reference,
      description: input.description ?? null,
      provider: provider.name,
      amount: input.amount,
      currency,
      customerEmail: input.customerEmail ?? null,
      organizationId: input.organizationId ?? null,
      idempotencyKey,
      metadata: input.metadata ?? {},
    })
    .returning();
  if (!payment) throw new Error("Création du paiement impossible.");

  try {
    const session = await provider.createCheckoutSession({
      amount: input.amount,
      currency,
      idempotencyKey,
      reference: input.reference,
      description: input.description,
      customerEmail: input.customerEmail,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
    const [updated] = await db
      .update(payments)
      .set({ providerSessionId: session.providerSessionId, status: "pending" })
      .where(eq(payments.id, payment.id))
      .returning();
    void logAuditEvent({ action: "PAYMENT_CREATE", resource: "payment", resourceId: payment.id, metadata: { reference: input.reference, amount: input.amount, currency } });
    return { payment: updated ?? payment, checkoutUrl: session.checkoutUrl };
  } catch (err) {
    // Échec fournisseur : pas de paiement orphelin.
    await db.delete(payments).where(eq(payments.id, payment.id)).catch(() => {});
    throw err;
  }
}

async function findPaymentForEvent(db: DrizzleDB, event: ProviderWebhookEvent): Promise<Payment | undefined> {
  const conditions = [eq(payments.providerPaymentId, event.providerPaymentId)];
  if (event.idempotencyKey) conditions.push(eq(payments.idempotencyKey, event.idempotencyKey));
  const [row] = await db.select().from(payments).where(or(...conditions)).limit(1);
  return row;
}

/**
 * Applique un événement fournisseur vérifié. Idempotent : rejouer le même
 * événement (retry Stripe) ne produit aucun effet supplémentaire.
 * Retourne `null` si aucun paiement ne correspond (événement ignoré).
 */
export async function applyProviderEvent(event: ProviderWebhookEvent, deps: { db?: DrizzleDB } = {}): Promise<Payment | null> {
  const db = deps.db ?? getDrizzle();
  const payment = await findPaymentForEvent(db, event);
  if (!payment) return null;

  if (event.outcome === "checkout.completed") {
    if (payment.status === "paid") return payment; // rejeu
    if (event.amount !== payment.amount || event.currency.toUpperCase() !== payment.currency) {
      throw new PaymentAmountMismatchError(payment.amount, event.amount, payment.currency);
    }
    if (!canTransitionPayment(payment.status, "paid")) return payment;
    const [paid] = await db
      .update(payments)
      .set({ status: "paid", paidAt: new Date(), providerPaymentId: event.providerPaymentId })
      .where(eq(payments.id, payment.id))
      .returning();
    void logAuditEvent({ action: "PAYMENT_PAID", resource: "payment", resourceId: payment.id, metadata: { reference: payment.reference } });
    await emitEvent("payment.succeeded", { paymentId: payment.id, reference: payment.reference, amount: payment.amount, currency: payment.currency });
    return paid ?? payment;
  }

  if (payment.status === "failed" || !canTransitionPayment(payment.status, "failed")) return payment;
  const [failed] = await db
    .update(payments)
    .set({ status: "failed", failedAt: new Date() })
    .where(eq(payments.id, payment.id))
    .returning();
  void logAuditEvent({ action: "PAYMENT_FAILED", resource: "payment", resourceId: payment.id, metadata: { reference: payment.reference } });
  await emitEvent("payment.failed", { paymentId: payment.id, reference: payment.reference });
  return failed ?? payment;
}

export async function listPayments(limit = 50, deps: { db?: DrizzleDB } = {}): Promise<Payment[]> {
  const db = deps.db ?? getDrizzle();
  return db.select().from(payments).orderBy(payments.createdAt).limit(Math.min(limit, 200));
}
