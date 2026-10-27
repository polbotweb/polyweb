/**
 * core/refunds — remboursements totaux ou partiels d'un paiement core/payments, pour tout
 * module (shop, bookings, sales, modules générés). Voir docs/refunds.md.
 *
 * Demande (`requestRefund`) :
 *  1. transaction : verrou `FOR UPDATE` du paiement (sérialise les demandes concurrentes),
 *     contrôle tenant / statut / devise, plafond « capturé − remboursé − en cours »,
 *     idempotence par clé, contrôle métier du module (`validate`), ligne `pending` ;
 *  2. appel fournisseur HORS transaction (clé fournisseur `refund:<id>`, métadonnée
 *     `refund_id`) ;
 *  3. transaction : issue appliquée (`settle`) — statut du paiement
 *     (`partially_refunded` / `refunded`) et réaction du module, ensemble.
 *
 * Webhooks (`refund.created|updated|failed`) : même `settle`, idempotent (trace
 * `payment_events`) ; un remboursement initié chez le fournisseur crée sa ligne
 * (`requestedBy` null). `resumeStaleRefunds` (cron) rejoue les appels restés incertains.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray, isNull, lt, type SQL } from 'drizzle-orm';
import { Effect } from 'effect';
import { getDrizzle } from '@database/drizzle';
import { payments, type Payment } from '@database/schemas/payments.schema';
import { refunds, type Refund, type RefundReason, type RefundStatus } from '@database/schemas/refunds.schema';
import { emitEventEffect } from '@/core/events';
import type { Money } from '@/core/money';
import {
  linkPaymentEvent, lockPaymentFor, parseReference, PaymentGateway, recordPaymentEvent, tenantPaymentSettings,
  type PaymentProvider, type ProviderRefundReason, type ProviderRefundStatus, type RefundEventOutcome, type VerifiedPaymentEvent,
} from '@/core/payments';
import { logAuditEventEffect } from '@/lib/audit';
import type { DbError } from '@/lib/effect/errors';
import { dbTry } from '@/lib/effect/run';
import { dbTransaction, type DbTransaction } from '@/lib/effect/transaction';
import { RefundAmountExceededError, RefundIdempotencyConflictError, RefundNotAllowedError } from './errors';
import { refundHandler } from './registry';
import { canTransitionRefund, isRefundablePayment, paymentStatusAfterRefunds, refundableRemainder } from './transitions';

export interface RequestRefundInput {
  readonly paymentId: string;
  /** Tenant de l'appelant : doit être celui du paiement (null = hors organisation). */
  readonly organizationId: string | null;
  /** Montant à rembourser ; absent = tout le reste remboursable. */
  readonly amount?: Money;
  readonly reason?: RefundReason;
  readonly note?: string | null;
  /** Clé d'idempotence de la demande (ex. `rma:<id>`, nonce de formulaire). */
  readonly idempotencyKey?: string;
  readonly requestedBy: string | null;
  /** Consignes au module propriétaire (ex. `{ restock: false }`). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Délai avant qu'un appel fournisseur incertain soit rejoué, et limite (clés Stripe : 24 h). */
const STALE_AFTER_MS = 10 * 60_000;
const GIVE_UP_AFTER_MS = 23 * 3_600_000;

const PROVIDER_REASONS: ReadonlySet<string> = new Set<ProviderRefundReason>(['requested_by_customer', 'duplicate', 'fraudulent']);
const providerReason = (reason: RefundReason): ProviderRefundReason | null => (PROVIDER_REASONS.has(reason) ? (reason as ProviderRefundReason) : null);

const lockPayment = (tx: DbTransaction, paymentId: string) =>
  dbTry('refunds.payment.lock', () => tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1).for('update')).pipe(Effect.map(([row]) => row));

const refundsOf = (tx: DbTransaction, paymentId: string) =>
  dbTry('refunds.ofPayment', () => tx.select({ status: refunds.status, amount: refunds.amount }).from(refunds).where(eq(refunds.paymentId, paymentId)));

const succeededTotal = (tx: DbTransaction, paymentId: string) =>
  dbTry('refunds.succeededTotal', () => tx.select({ amount: refunds.amount }).from(refunds).where(and(eq(refunds.paymentId, paymentId), eq(refunds.status, 'succeeded')))).pipe(
    Effect.map((rows) => rows.reduce((total, row) => total + row.amount, 0)),
  );

// --- Issue d'un remboursement -----------------------------------------------------------

interface Settlement {
  readonly status: ProviderRefundStatus;
  readonly providerRefundId?: string | null;
  readonly failureReason?: string | null;
}

interface Settled {
  readonly changed: boolean;
  readonly refund: Refund;
  readonly payment: Payment;
}

/**
 * Applique l'issue fournisseur à un remboursement, dans `tx`, paiement DÉJÀ verrouillé :
 * statut du remboursement, statut du paiement, réaction du module. Idempotent (une issue
 * identique ou une transition interdite ne change rien).
 */
const settle = (tx: DbTransaction, payment: Payment, refund: Refund, outcome: Settlement, now: Date) =>
  Effect.gen(function* () {
    const providerRefundId = outcome.providerRefundId ?? refund.providerRefundId;
    const sameStatus = refund.status === outcome.status;
    if (sameStatus || !canTransitionRefund(refund.status, outcome.status)) {
      if (providerRefundId && providerRefundId !== refund.providerRefundId) {
        const [linked] = yield* dbTry('refunds.link', () => tx.update(refunds).set({ providerRefundId }).where(eq(refunds.id, refund.id)).returning());
        return { changed: false, refund: linked ?? refund, payment } satisfies Settled;
      }
      return { changed: false, refund, payment } satisfies Settled;
    }
    const stamp = outcome.status === 'succeeded' ? { succeededAt: now, failureReason: null } : outcome.status === 'failed' ? { failedAt: now, failureReason: (outcome.failureReason ?? 'failed').slice(0, 200) } : {};
    const [row] = yield* dbTry('refunds.settle', () => tx.update(refunds).set({ status: outcome.status, providerRefundId, ...stamp }).where(eq(refunds.id, refund.id)).returning());
    const updated = row ?? refund;
    const total = yield* succeededTotal(tx, payment.id);
    let current = payment;
    if (outcome.status === 'succeeded') {
      if (total > payment.amount) yield* Effect.logError('[refunds] remboursements réussis supérieurs au montant capturé', { paymentId: payment.id, total, captured: payment.amount });
      const [paymentRow] = yield* dbTry('refunds.payment.status', () => tx.update(payments).set({ status: paymentStatusAfterRefunds(payment.amount, total) }).where(eq(payments.id, payment.id)).returning());
      current = paymentRow ?? payment;
    }
    const ref = parseReference(current.reference);
    const handler = ref ? refundHandler(ref.purpose) : undefined;
    const reaction = outcome.status === 'succeeded' ? handler?.onSucceeded : outcome.status === 'failed' ? handler?.onFailed : undefined;
    if (ref && reaction) {
      yield* reaction(tx, { refund: updated, payment: current, subjectId: ref.subjectId, totalRefunded: total, fullyRefunded: total >= current.amount }).pipe(
        Effect.withSpan('refunds.reaction', { attributes: { 'refunds.purpose': ref.purpose, 'refunds.status': outcome.status } }),
      );
    } else if (!handler) yield* Effect.logWarning('[refunds] aucune réaction enregistrée pour la référence', current.reference);
    return { changed: true, refund: updated, payment: current } satisfies Settled;
  });

const AUDIT: Partial<Record<RefundStatus, 'REFUND_SUCCEEDED' | 'REFUND_FAILED'>> = { succeeded: 'REFUND_SUCCEEDED', failed: 'REFUND_FAILED' };

/** Audit + événement, après validation de la transaction. */
const announce = ({ refund, payment }: Settled, source: string) =>
  Effect.gen(function* () {
    const action = AUDIT[refund.status];
    if (action) yield* logAuditEventEffect({ userId: refund.requestedBy, action, resource: 'refund', resourceId: refund.id, metadata: { paymentId: payment.id, reference: refund.reference, amount: refund.amount, currency: refund.currency, source, ...(refund.failureReason ? { failureReason: refund.failureReason } : {}) } });
    if (refund.status === 'succeeded') {
      yield* emitEventEffect('payment.refunded', { paymentId: payment.id, refundId: refund.id, reference: payment.reference, amount: refund.amount, currency: refund.currency, paymentStatus: payment.status });
    }
  });

const settleById = (refundId: string, outcome: Settlement, source: string, now = new Date()) =>
  Effect.gen(function* () {
    const settled = yield* dbTransaction('refunds.settle', (tx) =>
      Effect.gen(function* () {
        const [head] = yield* dbTry('refunds.find', () => tx.select({ paymentId: refunds.paymentId }).from(refunds).where(eq(refunds.id, refundId)).limit(1));
        if (!head) return null;
        // Ordre de verrouillage constant : paiement puis remboursement.
        const payment = yield* lockPayment(tx, head.paymentId);
        const [refund] = yield* dbTry('refunds.lock', () => tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1).for('update'));
        if (!payment || !refund) return null;
        return yield* settle(tx, payment, refund, outcome, now);
      }));
    if (settled?.changed) yield* announce(settled, source);
    return settled?.refund ?? null;
  });

/** Appel fournisseur puis application de son issue. Un échec incertain laisse `pending` (rejoué par le cron). */
const submit = (provider: PaymentProvider, refund: Refund, payment: Payment, now = new Date()) =>
  Effect.gen(function* () {
    // Compte connecté du tenant (Stripe Connect) : le remboursement part du compte qui a encaissé.
    const settings = yield* tenantPaymentSettings(payment.organizationId);
    const result = yield* Effect.result(provider.refund({
      refundId: refund.id, paymentId: payment.id, providerPaymentId: payment.providerPaymentId ?? '',
      amount: { amountMinor: refund.amount, currency: payment.currency as Money['currency'] },
      reason: providerReason(refund.reason), idempotencyKey: `refund:${refund.id}`, accountId: settings.accountId,
    }));
    if (result._tag === 'Success') {
      return (yield* settleById(refund.id, { status: result.success.status, providerRefundId: result.success.providerRefundId }, 'request', now)) ?? refund;
    }
    const error = result.failure;
    const definitive = error._tag === 'UnsupportedAmountError' || error.retryable === false;
    if (!definitive) {
      yield* Effect.logWarning('[refunds] appel fournisseur incertain — nouvel essai par le cron', { refundId: refund.id, cause: String(error.cause) });
      return refund;
    }
    return (yield* settleById(refund.id, { status: 'failed', failureReason: error._tag === 'PaymentProviderError' ? String(error.cause) : error._tag }, 'request', now)) ?? refund;
  });

// --- Demande ----------------------------------------------------------------------------

/** Demande un remboursement (total par défaut). Renvoie la ligne, `succeeded`, `pending` ou `failed`. */
export const requestRefund = (input: RequestRefundInput) =>
  Effect.gen(function* () {
    const provider = yield* (yield* PaymentGateway).provider;
    const idempotencyKey = input.idempotencyKey ?? `refund:${randomUUID()}`;
    const metadata = { ...input.metadata };
    const reserved = yield* dbTransaction('refunds.request', (tx) =>
      Effect.gen(function* () {
        const payment = yield* lockPayment(tx, input.paymentId);
        if (!payment || payment.organizationId !== input.organizationId) return yield* new RefundNotAllowedError({ paymentId: input.paymentId, reason: 'not_found' });
        const [existing] = yield* dbTry('refunds.idempotency', () => tx.select().from(refunds).where(eq(refunds.idempotencyKey, idempotencyKey)).limit(1));
        if (existing) {
          if (existing.paymentId !== payment.id || (input.amount && input.amount.amountMinor !== existing.amount)) return yield* new RefundIdempotencyConflictError({ idempotencyKey });
          return { fresh: false as const, refund: existing, payment };
        }
        if (payment.provider !== provider.name) return yield* new RefundNotAllowedError({ paymentId: payment.id, reason: 'status', detail: 'provider' });
        if (!isRefundablePayment(payment.status) || !payment.providerPaymentId) return yield* new RefundNotAllowedError({ paymentId: payment.id, reason: 'status', detail: payment.status });
        const available = refundableRemainder(payment.amount, yield* refundsOf(tx, payment.id));
        const amount = input.amount ?? { amountMinor: available, currency: payment.currency as Money['currency'] };
        if (amount.currency !== payment.currency) return yield* new RefundNotAllowedError({ paymentId: payment.id, reason: 'currency' });
        if (!Number.isSafeInteger(amount.amountMinor) || amount.amountMinor <= 0) return yield* new RefundNotAllowedError({ paymentId: payment.id, reason: 'amount' });
        if (amount.amountMinor > available) return yield* new RefundAmountExceededError({ requested: amount.amountMinor, available, currency: payment.currency });
        const ref = parseReference(payment.reference);
        const validate = ref ? refundHandler(ref.purpose)?.validate : undefined;
        if (ref && validate) yield* validate(tx, { payment, subjectId: ref.subjectId, amount, committed: payment.amount - available, metadata });
        const [refund] = yield* dbTry('refunds.insert', () => tx.insert(refunds).values({
          organizationId: payment.organizationId, paymentId: payment.id, reference: payment.reference, provider: payment.provider,
          amount: amount.amountMinor, currency: payment.currency, reason: input.reason ?? 'requested_by_customer', note: input.note?.slice(0, 500) || null,
          idempotencyKey, requestedBy: input.requestedBy, metadata,
        }).returning());
        return { fresh: true as const, refund: refund!, payment };
      }));
    if (!reserved.fresh) return reserved.refund;
    yield* logAuditEventEffect({ userId: input.requestedBy, action: 'REFUND_REQUEST', resource: 'refund', resourceId: reserved.refund.id, metadata: { paymentId: reserved.payment.id, reference: reserved.refund.reference, amount: reserved.refund.amount, currency: reserved.refund.currency, reason: reserved.refund.reason } });
    return yield* submit(provider, reserved.refund, reserved.payment);
  }).pipe(Effect.withSpan('refunds.request'));

// --- Webhooks fournisseur ---------------------------------------------------------------

/** Événement `refund` vérifié (branché sur core/payments par `setRefundEventSink`). */
export const applyRefundEvent = (provider: PaymentProvider, event: VerifiedPaymentEvent, now = new Date()): Effect.Effect<RefundEventOutcome, DbError> =>
  Effect.gen(function* () {
    const verified = event.refund;
    if (!verified) return 'unmatched' as const;
    const result = yield* dbTransaction('refunds.webhook', (tx) =>
      Effect.gen(function* () {
        const trace = yield* recordPaymentEvent(tx, provider, event);
        if (!trace) return { outcome: 'duplicate' as const };
        const known = yield* findRefund(tx, provider.name, verified.refundId, verified.providerRefundId);
        const payment = known ? yield* lockPayment(tx, known.paymentId) : yield* lockPaymentFor(tx, provider, event);
        if (!payment) return { outcome: 'unmatched' as const };
        yield* linkPaymentEvent(tx, trace, payment.id);
        if (verified.amount.currency !== payment.currency) {
          yield* Effect.logError('[refunds] devise du remboursement différente du paiement', { paymentId: payment.id, providerRefundId: verified.providerRefundId });
          return { outcome: 'unmatched' as const };
        }
        let refund: Refund;
        if (known) {
          const [locked] = yield* dbTry('refunds.lock', () => tx.select().from(refunds).where(eq(refunds.id, known.id)).limit(1).for('update'));
          refund = locked!;
        } else {
          // Remboursement initié chez le fournisseur (tableau de bord) : seul l'argent rendu compte.
          if (verified.status !== 'succeeded' && verified.status !== 'pending') return { outcome: 'unchanged' as const };
          const available = refundableRemainder(payment.amount, yield* refundsOf(tx, payment.id));
          if (verified.amount.amountMinor > available) yield* Effect.logError('[refunds] remboursement externe au-delà du reste remboursable', { paymentId: payment.id, amount: verified.amount.amountMinor, available });
          const [created] = yield* dbTry('refunds.external', () => tx.insert(refunds).values({
            organizationId: payment.organizationId, paymentId: payment.id, reference: payment.reference, provider: provider.name, providerRefundId: verified.providerRefundId,
            amount: verified.amount.amountMinor, currency: payment.currency, reason: 'other', idempotencyKey: `external:${provider.name}:${verified.providerRefundId}`, requestedBy: null,
            metadata: { origin: 'provider' },
          }).returning());
          refund = created!;
          yield* logAuditEventEffect({ action: 'REFUND_EXTERNAL', resource: 'refund', resourceId: refund.id, metadata: { paymentId: payment.id, reference: refund.reference, amount: refund.amount, currency: refund.currency } });
        }
        const settled = yield* settle(tx, payment, refund, { status: verified.status, providerRefundId: verified.providerRefundId, failureReason: verified.failureReason }, now);
        return { outcome: settled.changed ? ('applied' as const) : ('unchanged' as const), settled };
      }));
    if (result.outcome === 'applied' && 'settled' in result) yield* announce(result.settled, event.type);
    return result.outcome;
  }).pipe(Effect.withSpan('refunds.applyEvent', { attributes: { 'refunds.event': event.type } }));

const findRefund = (tx: DbTransaction, provider: string, refundId: string | null, providerRefundId: string) => {
  const byProvider = and(eq(refunds.provider, provider), eq(refunds.providerRefundId, providerRefundId));
  return dbTry('refunds.findForEvent', () =>
    tx.select({ id: refunds.id, paymentId: refunds.paymentId }).from(refunds).where(refundId ? eq(refunds.id, refundId) : byProvider).limit(1),
  ).pipe(Effect.flatMap(([row]) => (row || !refundId ? Effect.succeed(row) : dbTry('refunds.findForEvent.provider', () => tx.select({ id: refunds.id, paymentId: refunds.paymentId }).from(refunds).where(byProvider).limit(1)).pipe(Effect.map(([r]) => r)))));
};

// --- Reprise (cron) ---------------------------------------------------------------------

/**
 * Rejoue les appels fournisseur restés incertains (`pending` sans identifiant fournisseur,
 * plus de 10 min) avec la même clé d'idempotence ; au-delà de 23 h (expiration des clés
 * Stripe), le remboursement passe `failed` — une confirmation tardive reste acceptée.
 */
export const resumeStaleRefunds = (now = new Date(), limit = 50) =>
  Effect.gen(function* () {
    const stale = yield* dbTry('refunds.stale', () =>
      getDrizzle().select().from(refunds).where(and(eq(refunds.status, 'pending'), isNull(refunds.providerRefundId), lt(refunds.createdAt, new Date(now.getTime() - STALE_AFTER_MS)))).orderBy(refunds.createdAt).limit(limit));
    if (stale.length === 0) return { resumed: 0, abandoned: 0 };
    const provider = yield* (yield* PaymentGateway).provider;
    let resumed = 0;
    let abandoned = 0;
    for (const refund of stale) {
      if (refund.createdAt.getTime() < now.getTime() - GIVE_UP_AFTER_MS) {
        yield* settleById(refund.id, { status: 'failed', failureReason: 'provider_unreachable' }, 'cron', now);
        abandoned += 1;
        continue;
      }
      const [payment] = yield* dbTry('refunds.stale.payment', () => getDrizzle().select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1));
      if (!payment || payment.provider !== provider.name) continue;
      yield* submit(provider, refund, payment, now);
      resumed += 1;
    }
    return { resumed, abandoned };
  }).pipe(Effect.withSpan('refunds.resumeStale'));

// --- Lectures ---------------------------------------------------------------------------

export interface RefundSummary {
  readonly captured: number;
  readonly refunded: number;
  readonly pending: number;
  readonly remaining: number;
  readonly currency: string;
}

export const summarizeRefunds = (payment: Pick<Payment, 'amount' | 'currency' | 'status'>, rows: readonly Pick<Refund, 'status' | 'amount'>[]): RefundSummary => {
  const refunded = rows.filter((r) => r.status === 'succeeded').reduce((t, r) => t + r.amount, 0);
  const pending = rows.filter((r) => r.status === 'pending').reduce((t, r) => t + r.amount, 0);
  return { captured: payment.amount, refunded, pending, remaining: isRefundablePayment(payment.status) ? refundableRemainder(payment.amount, rows) : 0, currency: payment.currency };
};

/** Remboursements d'un paiement, du plus récent au plus ancien. */
export const refundsForPayment = (paymentId: string) =>
  dbTry('refunds.forPayment', () => getDrizzle().select().from(refunds).where(eq(refunds.paymentId, paymentId)).orderBy(desc(refunds.createdAt)));

export interface RefundListFilter {
  readonly status?: RefundStatus;
  readonly since?: Date;
  readonly limit?: number;
}

/** Remboursements d'un tenant (admin, `payment:read`). */
export const listRefunds = (organizationId: string | null, filter: RefundListFilter = {}) => {
  const conditions: SQL[] = [organizationId === null ? isNull(refunds.organizationId) : eq(refunds.organizationId, organizationId)];
  if (filter.status) conditions.push(eq(refunds.status, filter.status));
  if (filter.since) conditions.push(gte(refunds.createdAt, filter.since));
  return dbTry('refunds.list', () => getDrizzle().select().from(refunds).where(and(...conditions)).orderBy(desc(refunds.createdAt)).limit(Math.min(filter.limit ?? 100, 500)));
};

/** Paiements d'un objet avec leurs remboursements (pages admin des modules). */
export const refundablePaymentsFor = (reference: string) =>
  Effect.gen(function* () {
    const rows = yield* dbTry('refunds.payments', () => getDrizzle().select().from(payments).where(and(eq(payments.reference, reference), inArray(payments.status, ['paid', 'partially_refunded', 'refunded']))).orderBy(desc(payments.createdAt)));
    if (rows.length === 0) return [];
    const all = yield* dbTry('refunds.ofPayments', () => getDrizzle().select().from(refunds).where(inArray(refunds.paymentId, rows.map((p) => p.id))).orderBy(desc(refunds.createdAt)));
    return rows.map((payment) => {
      const own = all.filter((r) => r.paymentId === payment.id);
      return { payment, refunds: own, summary: summarizeRefunds(payment, own) };
    });
  });
