/**
 * Service de paiement générique — création de session de paiement et
 * traitement idempotent des webhooks fournisseur.
 *
 * Inspiré du tunnel atlaselle (signature → idempotence → montants →
 * transaction), sans dépendance au métier voyage.
 *
 * Implémentation Effect (`startCheckoutEffect`, `applyProviderEventEffect`) :
 * erreurs typées, timeout sur l'appel fournisseur, compensation en cas d'échec.
 * Les fonctions Promise sont des adaptateurs (rejettent l'erreur d'origine).
 */
import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { getDrizzle, type DrizzleDB } from "@database/drizzle";
import { payments, type Payment } from "@database/schemas/payments.schema";
import { Data, Duration, Effect, Exit } from "effect";
import { emitEventEffect } from "@/core/events";
import { logAuditEvent } from "@/lib/audit";
import { DbError, UpstreamError, ValidationError } from "@/lib/effect/errors";
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

/** Montant/devise du webhook ≠ paiement en base (tentative de fraude ou bug fournisseur). */
export class PaymentAmountMismatchError extends Data.TaggedError("PaymentAmountMismatchError")<{
  readonly expected: number;
  readonly received: number;
  readonly currency: string;
}> {
  override get message() {
    return `Montant incohérent : attendu ${this.expected} ${this.currency}, reçu ${this.received}.`;
  }
}

export type PaymentError = ValidationError | DbError | UpstreamError | PaymentAmountMismatchError;

const PROVIDER_TIMEOUT = Duration.seconds(20);
const dbOp = <A>(operation: string, f: () => Promise<A>) => Effect.tryPromise({ try: f, catch: (cause) => new DbError({ operation, cause }) });

export const startCheckoutEffect = (input: StartCheckoutInput, deps: { db?: DrizzleDB; provider?: PaymentProvider } = {}) =>
  Effect.gen(function* () {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      return yield* new ValidationError({ issues: [{ path: "amount", message: "Le montant doit être un entier positif (centimes)." }] });
    }
    const db = deps.db ?? getDrizzle();
    const provider = deps.provider ?? selectPaymentProvider();
    const currency = (input.currency ?? "EUR").toUpperCase();
    const idempotencyKey = randomUUID();

    const [payment] = yield* dbOp("payments.insert", () =>
      db
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
        .returning(),
    );
    if (!payment) return yield* new DbError({ operation: "payments.insert", cause: "no row returned" });

    const session = yield* Effect.tryPromise({
      try: () =>
        provider.createCheckoutSession({
          amount: input.amount,
          currency,
          idempotencyKey,
          reference: input.reference,
          description: input.description,
          customerEmail: input.customerEmail,
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
        }),
      catch: (cause) => new UpstreamError({ service: `payments:${provider.name}`, cause }),
    }).pipe(
      Effect.timeoutOrElse({ duration: PROVIDER_TIMEOUT, orElse: () => Effect.fail(new UpstreamError({ service: `payments:${provider.name}`, cause: "timeout" })) }),
      // Échec fournisseur : pas de paiement orphelin.
      Effect.tapError(() => dbOp("payments.compensate", () => db.delete(payments).where(eq(payments.id, payment.id))).pipe(Effect.ignore)),
    );
    const [updated] = yield* dbOp("payments.pending", () =>
      db.update(payments).set({ providerSessionId: session.providerSessionId, status: "pending" }).where(eq(payments.id, payment.id)).returning(),
    );
    void logAuditEvent({ action: "PAYMENT_CREATE", resource: "payment", resourceId: payment.id, metadata: { reference: input.reference, amount: input.amount, currency } });
    return { payment: updated ?? payment, checkoutUrl: session.checkoutUrl };
  }).pipe(Effect.withSpan("payments.startCheckout"));

const findPaymentForEvent = (db: DrizzleDB, event: ProviderWebhookEvent) => {
  const conditions = [eq(payments.providerPaymentId, event.providerPaymentId)];
  if (event.idempotencyKey) conditions.push(eq(payments.idempotencyKey, event.idempotencyKey));
  return dbOp("payments.findForEvent", () => db.select().from(payments).where(or(...conditions)).limit(1)).pipe(Effect.map(([row]) => row));
};

/**
 * Applique un événement fournisseur vérifié. Idempotent : rejouer le même
 * événement (retry Stripe) ne produit aucun effet supplémentaire.
 * Retourne `null` si aucun paiement ne correspond (événement ignoré).
 */
export const applyProviderEventEffect = (event: ProviderWebhookEvent, deps: { db?: DrizzleDB } = {}) =>
  Effect.gen(function* () {
    const db = deps.db ?? getDrizzle();
    const payment = yield* findPaymentForEvent(db, event);
    if (!payment) return null;

    if (event.outcome === "checkout.completed") {
      if (payment.status === "paid") return payment; // rejeu
      if (event.amount !== payment.amount || event.currency.toUpperCase() !== payment.currency) {
        return yield* new PaymentAmountMismatchError({ expected: payment.amount, received: event.amount, currency: payment.currency });
      }
      if (!canTransitionPayment(payment.status, "paid")) return payment;
      const [paid] = yield* dbOp("payments.paid", () =>
        db.update(payments).set({ status: "paid", paidAt: new Date(), providerPaymentId: event.providerPaymentId }).where(eq(payments.id, payment.id)).returning(),
      );
      void logAuditEvent({ action: "PAYMENT_PAID", resource: "payment", resourceId: payment.id, metadata: { reference: payment.reference } });
      yield* emitEventEffect("payment.succeeded", { paymentId: payment.id, reference: payment.reference, amount: payment.amount, currency: payment.currency });
      return paid ?? payment;
    }

    if (payment.status === "failed" || !canTransitionPayment(payment.status, "failed")) return payment;
    const [failed] = yield* dbOp("payments.failed", () => db.update(payments).set({ status: "failed", failedAt: new Date() }).where(eq(payments.id, payment.id)).returning());
    void logAuditEvent({ action: "PAYMENT_FAILED", resource: "payment", resourceId: payment.id, metadata: { reference: payment.reference } });
    yield* emitEventEffect("payment.failed", { paymentId: payment.id, reference: payment.reference });
    return failed ?? payment;
  }).pipe(Effect.withSpan("payments.applyProviderEvent"));

export const listPaymentsEffect = (limit = 50, deps: { db?: DrizzleDB } = {}) =>
  dbOp("payments.list", () => (deps.db ?? getDrizzle()).select().from(payments).orderBy(payments.createdAt).limit(Math.min(limit, 200)));

// --- Adaptateurs Promise -----------------------------------------------------

async function runPayment<A>(effect: Effect.Effect<A, PaymentError>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const fail = exit.cause.reasons.find((r) => r._tag === "Fail");
  if (fail && fail._tag === "Fail") {
    const e = fail.error;
    if (e._tag === "PaymentAmountMismatchError") throw e;
    if (e._tag === "ValidationError") throw new Error(e.message);
    throw e.cause instanceof Error ? e.cause : new Error(e.message);
  }
  throw new Error("[payments] unexpected failure");
}

export const startCheckout = (input: StartCheckoutInput, deps: { db?: DrizzleDB; provider?: PaymentProvider } = {}): Promise<{ payment: Payment; checkoutUrl: string }> =>
  runPayment(startCheckoutEffect(input, deps));
export const applyProviderEvent = (event: ProviderWebhookEvent, deps: { db?: DrizzleDB } = {}): Promise<Payment | null> => runPayment(applyProviderEventEffect(event, deps));
export const listPayments = (limit = 50, deps: { db?: DrizzleDB } = {}): Promise<Payment[]> => runPayment(listPaymentsEffect(limit, deps));
