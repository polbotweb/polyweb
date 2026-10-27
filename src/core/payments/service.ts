/**
 * core/payments — service générique de paiement en ligne (réutilisable par tout module).
 *
 * - `startCheckout` : crée (ou réutilise) un paiement `pending` pour `<purpose>:<subjectId>`
 *   et renvoie l'URL de paiement hébergée du fournisseur ; échéance bornée à [30 min, 24 h].
 * - `startPaymentIntent` : variante Payment Intent (paiement intégré, `clientSecret`).
 * - `handleWebhook` : signature vérifiée sur le corps brut → transaction unique : trace
 *   d'idempotence `payment_events` (provider, event_id), verrou `FOR UPDATE` du paiement,
 *   contrôle montant/devise, transition d'état, réaction du module propriétaire.
 * - `expireDuePayments` : passe `expired` les paiements échus (cron) et prévient le module.
 * - Événements `refund` : délégués à core/refunds (`setRefundEventSink`).
 *
 * Montants : `Money` (core/money). Secrets : environnement uniquement (`PaymentGateway`).
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { getDrizzle } from '@database/drizzle';
import { paymentEvents, payments, paymentSettings, type Payment, type PaymentStatus } from '@database/schemas/payments.schema';
import { emitEventEffect } from '@/core/events';
import { isCurrencyCode, type Money } from '@/core/money';
import { logAuditEventEffect } from '@/lib/audit';
import { DbError } from '@/lib/effect/errors';
import { dbTry } from '@/lib/effect/run';
import { dbTransaction, type DbTransaction } from '@/lib/effect/transaction';
import { PaymentAmountMismatchError, PaymentsUnavailableError, UnsupportedAmountError } from './errors';
import { PaymentGateway } from './gateway';
import type { PaymentEventKind, PaymentProvider, VerifiedPaymentEvent } from './provider';
import { paymentPurpose, registeredPaymentHandlers, type PaymentPurposeHandler } from './purposes';
import { dispatchRefundEvent, type RefundEventOutcome } from './refund-sink';
import { formatReference, parseReference } from './reference';
import { canTransitionPayment } from './transitions';

const MIN_EXPIRY_MINUTES = 30;
const MAX_EXPIRY_MINUTES = 24 * 60;
const DEFAULT_EXPIRY_MINUTES = 60;

export interface TenantPaymentSettings {
  readonly enabled: boolean;
  readonly defaultCurrency: string;
  readonly accountId: string | null;
  readonly statementDescriptor: string | null;
  readonly checkoutExpiryMinutes: number;
}

/** Réglages d'un tenant (`null` = plateforme) ; sans ligne : activé, valeurs par défaut. */
export const tenantPaymentSettings = (organizationId: string | null) =>
  dbTry('payments.settings', () =>
    getDrizzle().select().from(paymentSettings).where(organizationId === null ? isNull(paymentSettings.organizationId) : eq(paymentSettings.organizationId, organizationId)).limit(1),
  ).pipe(
    Effect.map(([row]): TenantPaymentSettings =>
      row
        ? { enabled: row.enabled, defaultCurrency: row.defaultCurrency, accountId: row.stripeAccountId, statementDescriptor: row.statementDescriptor, checkoutExpiryMinutes: row.checkoutExpiryMinutes }
        : { enabled: true, defaultCurrency: 'EUR', accountId: null, statementDescriptor: null, checkoutExpiryMinutes: DEFAULT_EXPIRY_MINUTES },
    ),
  );

/** Échéance bornée aux limites Stripe Checkout (30 min ≤ échéance ≤ 24 h). */
export const clampExpiry = (now: Date, requested: Date | undefined, minutes: number): Date => {
  const min = now.getTime() + MIN_EXPIRY_MINUTES * 60_000;
  const max = now.getTime() + MAX_EXPIRY_MINUTES * 60_000;
  const wanted = requested?.getTime() ?? now.getTime() + minutes * 60_000;
  return new Date(Math.min(max, Math.max(min, wanted)));
};

export interface StartCheckoutInput {
  readonly organizationId: string | null;
  readonly purpose: string;
  readonly subjectId: string;
  readonly amount: Money;
  readonly description: string;
  readonly customerEmail?: string | null;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly expiresAt?: Date;
  readonly metadata?: Record<string, string | number | boolean | null>;
  readonly now?: Date;
}

const ensureEnabled = (settings: TenantPaymentSettings) =>
  settings.enabled ? Effect.void : Effect.fail(new PaymentsUnavailableError({ reason: 'désactivé pour ce tenant' }));

const ensurePositive = (amount: Money) =>
  Number.isSafeInteger(amount.amountMinor) && amount.amountMinor > 0 && isCurrencyCode(amount.currency)
    ? Effect.void
    : Effect.fail(new UnsupportedAmountError({ currency: amount.currency, amountMinor: amount.amountMinor, reason: 'non-positive' }));

/** Paiement en attente réutilisable (même référence, même montant, encore valable). */
const reusablePending = (reference: string, amount: Money, provider: string, now: Date) =>
  dbTry('payments.reusable', () =>
    getDrizzle().select().from(payments).where(and(
      eq(payments.reference, reference), eq(payments.provider, provider), eq(payments.status, 'pending'),
      eq(payments.amount, amount.amountMinor), eq(payments.currency, amount.currency),
      sql`${payments.expiresAt} > ${new Date(now.getTime() + 5 * 60_000)}`,
    )).limit(1),
  ).pipe(Effect.map(([row]) => (row && typeof row.metadata.checkoutUrl === 'string' ? { payment: row, url: row.metadata.checkoutUrl } : null)));

const insertPayment = (values: typeof payments.$inferInsert) =>
  dbTry('payments.insert', () => getDrizzle().insert(payments).values(values).returning()).pipe(
    Effect.flatMap(([row]) => (row ? Effect.succeed(row) : Effect.fail(new DbError({ operation: 'payments.insert', cause: 'no row returned' })))),
  );

const compensate = (id: string) => dbTry('payments.compensate', () => getDrizzle().delete(payments).where(eq(payments.id, id))).pipe(Effect.ignore);

/** Lien de paiement hébergé (Stripe Checkout) pour `<purpose>:<subjectId>`. */
export const startCheckout = (input: StartCheckoutInput) =>
  Effect.gen(function* () {
    const now = input.now ?? new Date();
    const reference = yield* formatReference({ purpose: input.purpose, subjectId: input.subjectId });
    yield* ensurePositive(input.amount);
    const provider = yield* (yield* PaymentGateway).provider;
    const settings = yield* tenantPaymentSettings(input.organizationId);
    yield* ensureEnabled(settings);
    const reused = yield* reusablePending(reference, input.amount, provider.name, now);
    if (reused) return reused;

    const expiresAt = clampExpiry(now, input.expiresAt, settings.checkoutExpiryMinutes);
    const id = randomUUID();
    const payment = yield* insertPayment({
      id, organizationId: input.organizationId, reference, description: input.description, provider: provider.name,
      amount: input.amount.amountMinor, currency: input.amount.currency, customerEmail: input.customerEmail ?? null,
      idempotencyKey: `checkout:${id}`, metadata: { ...input.metadata }, expiresAt,
    });
    const session = yield* provider.createCheckoutSession({
      paymentId: id, reference, amount: input.amount, description: input.description, customerEmail: input.customerEmail ?? null,
      successUrl: input.successUrl, cancelUrl: input.cancelUrl, expiresAt, accountId: settings.accountId, statementDescriptor: settings.statementDescriptor,
    }).pipe(Effect.tapError(() => compensate(id))); // échec fournisseur : pas de paiement orphelin
    const [updated] = yield* dbTry('payments.pending', () =>
      getDrizzle().update(payments).set({ status: 'pending', providerSessionId: session.sessionId, metadata: { ...payment.metadata, checkoutUrl: session.url } }).where(eq(payments.id, id)).returning());
    yield* logAuditEventEffect({ action: 'PAYMENT_CREATE', resource: 'payment', resourceId: id, metadata: { reference, amount: input.amount.amountMinor, currency: input.amount.currency, provider: provider.name } });
    return { payment: updated ?? payment, url: session.url };
  }).pipe(Effect.withSpan('payments.startCheckout'));

/** Payment Intent (paiement intégré côté client) ; le `clientSecret` n'est jamais stocké. */
export const startPaymentIntent = (input: Omit<StartCheckoutInput, 'successUrl' | 'cancelUrl' | 'expiresAt'>) =>
  Effect.gen(function* () {
    const reference = yield* formatReference({ purpose: input.purpose, subjectId: input.subjectId });
    yield* ensurePositive(input.amount);
    const provider = yield* (yield* PaymentGateway).provider;
    const settings = yield* tenantPaymentSettings(input.organizationId);
    yield* ensureEnabled(settings);
    const id = randomUUID();
    yield* insertPayment({
      id, organizationId: input.organizationId, reference, description: input.description, provider: provider.name,
      amount: input.amount.amountMinor, currency: input.amount.currency, customerEmail: input.customerEmail ?? null,
      idempotencyKey: `intent:${id}`, metadata: { ...input.metadata },
    });
    const intent = yield* provider.createPaymentIntent({
      paymentId: id, reference, amount: input.amount, description: input.description, customerEmail: input.customerEmail ?? null,
      accountId: settings.accountId, statementDescriptor: settings.statementDescriptor,
    }).pipe(Effect.tapError(() => compensate(id)));
    const [payment] = yield* dbTry('payments.intent.pending', () => getDrizzle().update(payments).set({ status: 'pending', providerPaymentId: intent.intentId }).where(eq(payments.id, id)).returning());
    yield* logAuditEventEffect({ action: 'PAYMENT_CREATE', resource: 'payment', resourceId: id, metadata: { reference, amount: input.amount.amountMinor, currency: input.amount.currency, provider: provider.name, intent: true } });
    return { payment: payment!, clientSecret: intent.clientSecret };
  }).pipe(Effect.withSpan('payments.startPaymentIntent'));

// --- Webhook ---------------------------------------------------------------------------

export type WebhookResult =
  | { readonly status: 'ignored' | 'duplicate' | 'unmatched'; readonly eventId: string }
  | { readonly status: 'refund'; readonly eventId: string; readonly outcome: RefundEventOutcome | 'ignored' }
  | { readonly status: 'applied' | 'unchanged'; readonly eventId: string; readonly payment: Payment };

type TransitionKind = Exclude<PaymentEventKind, 'ignored' | 'refund'>;

const TARGET: Record<TransitionKind, PaymentStatus> = { succeeded: 'paid', failed: 'failed', expired: 'expired' };

/** Verrouille (`FOR UPDATE`) le paiement désigné par un événement fournisseur (exposé pour core/refunds). */
export const lockPaymentFor = (tx: DbTransaction, provider: PaymentProvider, event: VerifiedPaymentEvent) => {
  const keys = [
    event.paymentId ? eq(payments.id, event.paymentId) : undefined,
    event.providerPaymentId ? eq(payments.providerPaymentId, event.providerPaymentId) : undefined,
    event.sessionId ? eq(payments.providerSessionId, event.sessionId) : undefined,
  ].filter((c) => c !== undefined);
  if (keys.length === 0) return Effect.succeed(undefined);
  return dbTry('payments.lockForEvent', () => tx.select().from(payments).where(and(eq(payments.provider, provider.name), or(...keys))).limit(1).for('update')).pipe(Effect.map(([row]) => row));
};

const reactionOf = (handler: PaymentPurposeHandler | undefined, kind: TransitionKind) =>
  kind === 'succeeded' ? handler?.onSucceeded : kind === 'failed' ? handler?.onFailed : handler?.onExpired;

/** Transition + réaction du module, dans `tx` (paiement déjà verrouillé). */
const applyTransition = (tx: DbTransaction, payment: Payment, kind: TransitionKind, extra: { providerPaymentId?: string | null; now: Date }) =>
  Effect.gen(function* () {
    const to = TARGET[kind];
    if (payment.status === to || !canTransitionPayment(payment.status, to)) return { changed: false as const, payment };
    const stamp = kind === 'succeeded' ? { paidAt: extra.now } : kind === 'failed' ? { failedAt: extra.now } : {};
    const [row] = yield* dbTry('payments.transition', () =>
      tx.update(payments).set({ status: to, ...stamp, ...(extra.providerPaymentId ? { providerPaymentId: extra.providerPaymentId } : {}) }).where(eq(payments.id, payment.id)).returning());
    const updated = row ?? payment;
    const ref = parseReference(updated.reference);
    const reaction = ref ? reactionOf(paymentPurpose(ref.purpose), kind) : undefined;
    if (ref && reaction) yield* reaction(tx, updated, ref.subjectId);
    else if (!ref || !paymentPurpose(ref.purpose)) yield* Effect.logWarning('[payments] aucun gestionnaire pour la référence', updated.reference);
    return { changed: true as const, payment: updated };
  });

const AUDIT = { succeeded: 'PAYMENT_PAID', failed: 'PAYMENT_FAILED', expired: 'PAYMENT_EXPIRED' } as const;

const announce = (payment: Payment, kind: TransitionKind, source: string) =>
  Effect.gen(function* () {
    yield* logAuditEventEffect({ action: AUDIT[kind], resource: 'payment', resourceId: payment.id, metadata: { reference: payment.reference, source } });
    if (kind === 'succeeded') yield* emitEventEffect('payment.succeeded', { paymentId: payment.id, reference: payment.reference, amount: payment.amount, currency: payment.currency });
    if (kind === 'failed') yield* emitEventEffect('payment.failed', { paymentId: payment.id, reference: payment.reference });
  });

/**
 * Trace d'idempotence d'un événement fournisseur, dans `tx` : renvoie l'id de la trace, ou
 * `null` si l'événement a déjà été traité (rejeu). Exposé pour core/refunds.
 */
export const recordPaymentEvent = (tx: DbTransaction, provider: PaymentProvider, event: VerifiedPaymentEvent) =>
  dbTry('payments.event.insert', () =>
    tx.insert(paymentEvents).values({ provider: provider.name, eventId: event.eventId, type: event.type }).onConflictDoNothing().returning({ id: paymentEvents.id })).pipe(Effect.map((rows) => rows[0]?.id ?? null));

/** Rattache une trace d'événement à son paiement. */
export const linkPaymentEvent = (tx: DbTransaction, traceId: string, paymentId: string) =>
  dbTry('payments.event.link', () => tx.update(paymentEvents).set({ paymentId }).where(eq(paymentEvents.id, traceId))).pipe(Effect.asVoid);

/** Applique un événement déjà vérifié (exposé pour les tests et l'outillage). */
export const applyVerifiedEvent = (provider: PaymentProvider, event: VerifiedPaymentEvent, now = new Date()) =>
  Effect.gen(function* () {
    if (event.kind === 'ignored') return { status: 'ignored', eventId: event.eventId } satisfies WebhookResult as WebhookResult;
    // Remboursements : idempotence, plafond et réactions des modules portés par core/refunds.
    if (event.kind === 'refund') return { status: 'refund', eventId: event.eventId, outcome: yield* dispatchRefundEvent(provider, event) } satisfies WebhookResult as WebhookResult;
    const kind = event.kind;
    const result = yield* dbTransaction('payments.webhook', (tx) =>
      Effect.gen(function* () {
        const trace = yield* recordPaymentEvent(tx, provider, event);
        if (!trace) return { status: 'duplicate', eventId: event.eventId } satisfies WebhookResult as WebhookResult;
        const payment = yield* lockPaymentFor(tx, provider, event);
        if (!payment) return { status: 'unmatched', eventId: event.eventId } satisfies WebhookResult as WebhookResult;
        if (kind === 'succeeded' && (!event.amount || event.amount.amountMinor !== payment.amount || event.amount.currency !== payment.currency)) {
          return yield* new PaymentAmountMismatchError({ expected: payment.amount, received: event.amount?.amountMinor ?? -1, currency: payment.currency });
        }
        const applied = yield* applyTransition(tx, payment, kind, { providerPaymentId: event.providerPaymentId, now });
        yield* linkPaymentEvent(tx, trace, payment.id);
        return { status: applied.changed ? 'applied' : 'unchanged', eventId: event.eventId, payment: applied.payment } satisfies WebhookResult as WebhookResult;
      }));
    if (result.status === 'applied') yield* announce(result.payment, kind, event.type);
    return result;
  }).pipe(Effect.withSpan('payments.applyVerifiedEvent', { attributes: { 'payments.event': event.type } }));

/** Webhook fournisseur : vérification de signature sur le corps brut, puis application idempotente. */
export const handleWebhook = (rawBody: string, headers: Headers, now = new Date()) =>
  Effect.gen(function* () {
    const provider = yield* (yield* PaymentGateway).provider;
    const event = yield* provider.verifyWebhook(rawBody, headers.get(provider.signatureHeader));
    return yield* applyVerifiedEvent(provider, event, now);
  }).pipe(Effect.withSpan('payments.handleWebhook'));

// --- Échéances --------------------------------------------------------------------------

/** Expire les paiements `created`/`pending`/`failed` échus (au plus `limit`) ; renvoie le nombre traité. */
export const expireDuePayments = (now = new Date(), limit = 100) =>
  Effect.gen(function* () {
    const due = yield* dbTry('payments.due', () =>
      getDrizzle().select({ id: payments.id }).from(payments).where(and(inArray(payments.status, ['created', 'pending', 'failed']), lt(payments.expiresAt, now))).limit(limit));
    let expired = 0;
    for (const { id } of due) {
      const done = yield* dbTransaction('payments.expire', (tx) =>
        Effect.gen(function* () {
          const [payment] = yield* dbTry('payments.expire.lock', () => tx.select().from(payments).where(eq(payments.id, id)).limit(1).for('update'));
          if (!payment || !payment.expiresAt || payment.expiresAt >= now) return null;
          const applied = yield* applyTransition(tx, payment, 'expired', { now });
          return applied.changed ? applied.payment : null;
        }));
      if (done) {
        expired += 1;
        yield* announce(done, 'expired', 'cron');
      }
    }
    let swept = 0;
    for (const handler of registeredPaymentHandlers()) {
      if (handler.sweep) swept += yield* handler.sweep(now).pipe(Effect.withSpan('payments.sweep', { attributes: { 'payments.purpose': handler.purpose } }));
    }
    return { expired, swept };
  }).pipe(Effect.withSpan('payments.expireDuePayments'));

/** Paiements d'un objet (ex. historique d'une facture), du plus récent au plus ancien. */
export const paymentsFor = (purpose: string, subjectId: string) =>
  Effect.flatMap(formatReference({ purpose, subjectId }), (reference) =>
    dbTry('payments.for', () => getDrizzle().select().from(payments).where(eq(payments.reference, reference)).orderBy(sql`${payments.createdAt} desc`)));
