/**
 * Acompte de réservation via core/payments (objet `booking`, référence `booking:<id>`).
 *
 * - Payé → la demande `REQUESTED` passe `CONFIRMED` (numéro core/numbering, `depositPaidAt`).
 * - Expiré → la demande non payée passe `EXPIRED` (créneau libéré).
 * - Paiement reçu après expiration/annulation : `depositPaidAt` est enregistré et l'anomalie
 *   journalisée (remboursement à traiter par l'administration) ; jamais d'échec du webhook.
 * - `sweepUnpaidBookings` : filet de sécurité (cron) pour les demandes dont l'échéance est
 *   dépassée sans paiement créé (ex. fournisseur indisponible au moment de la demande).
 */
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { getDrizzle } from '@database/drizzle';
import type { Payment } from '@database/schemas/payments.schema';
import { assignDocumentNumber } from '@/core/numbering';
import { registerPaymentPurpose, startCheckout, UnsupportedAmountError } from '@/core/payments';
import { isCurrencyCode } from '@/core/money';
import { dbTry } from '@/lib/effect/run';
import type { DbTransaction } from '@/lib/effect/transaction';
import { bookings } from './schema';
import { BOOKING_NUMBERING_KEY, DEFAULT_BOOKING_NUMBERING } from './domain/numbering';

export const BOOKING_PAYMENT_PURPOSE = 'booking';
/** Marge après l'échéance avant le balayage (le webhook d'expiration Stripe arrive d'abord). */
const SWEEP_GRACE_MS = 10 * 60_000;

type BookingRow = typeof bookings.$inferSelect;

const lockBooking = (tx: DbTransaction, id: string) =>
  dbTry('bookings.payment.lock', () => tx.select().from(bookings).where(eq(bookings.id, id)).limit(1).for('update')).pipe(Effect.map(([row]) => row));

const confirmPaid = (tx: DbTransaction, payment: Payment, bookingId: string) =>
  Effect.gen(function* () {
    const booking = yield* lockBooking(tx, bookingId);
    if (!booking) return yield* Effect.logWarning('[bookings] acompte payé pour une réservation inconnue', { paymentId: payment.id });
    if (booking.depositPaidAt) return;
    const paidAt = payment.paidAt ?? new Date();
    if (booking.status !== 'REQUESTED') {
      yield* dbTry('bookings.payment.late', () => tx.update(bookings).set({ depositPaidAt: paidAt }).where(eq(bookings.id, bookingId)));
      return yield* Effect.logError('[bookings] acompte reçu hors demande en attente — remboursement à traiter', { bookingId, status: booking.status, paymentId: payment.id });
    }
    const number = booking.number ?? (yield* assignDocumentNumber(tx, {
      organizationId: booking.organizationId, key: BOOKING_NUMBERING_KEY, scheme: DEFAULT_BOOKING_NUMBERING, date: paidAt.toISOString().slice(0, 10),
    }).pipe(Effect.map(({ number: n }): string | null => n),
      Effect.catch((e) => (e._tag === 'DbError' ? Effect.fail(e) : Effect.logError('[bookings] numérotation impossible', e).pipe(Effect.as(null)))),
    ));
    if (number === null) {
      // Acompte enregistré, confirmation laissée à l'administration (numérotation à corriger).
      yield* dbTry('bookings.payment.paid', () => tx.update(bookings).set({ depositPaidAt: paidAt }).where(eq(bookings.id, bookingId)));
      return;
    }
    yield* dbTry('bookings.payment.confirm', () => tx.update(bookings).set({ status: 'CONFIRMED', number, confirmedAt: paidAt, depositPaidAt: paidAt }).where(eq(bookings.id, bookingId)));
  });

const expireUnpaid = (tx: DbTransaction, _payment: Payment, bookingId: string) =>
  Effect.gen(function* () {
    const booking = yield* lockBooking(tx, bookingId);
    if (!booking || booking.status !== 'REQUESTED' || booking.depositPaidAt || booking.depositMinor <= 0) return;
    yield* dbTry('bookings.payment.expire', () => tx.update(bookings).set({ status: 'EXPIRED' }).where(eq(bookings.id, bookingId)));
  });

/** Demandes avec acompte échu non payé (au-delà de la marge) → EXPIRED. */
export const sweepUnpaidBookings = (now = new Date()) =>
  dbTry('bookings.payment.sweep', () =>
    getDrizzle().update(bookings).set({ status: 'EXPIRED' }).where(and(
      eq(bookings.status, 'REQUESTED'), isNull(bookings.depositPaidAt), sql`${bookings.depositMinor} > 0`, lt(bookings.paymentDueAt, new Date(now.getTime() - SWEEP_GRACE_MS)),
    )).returning({ id: bookings.id }),
  ).pipe(Effect.map((rows) => rows.length));

export const registerBookingPayments = () =>
  registerPaymentPurpose({ purpose: BOOKING_PAYMENT_PURPOSE, onSucceeded: confirmPaid, onExpired: expireUnpaid, sweep: sweepUnpaidBookings });

/** Acompte encore dû (demande en attente, non payée, échéance future). */
export const depositDue = (booking: Pick<BookingRow, 'status' | 'depositMinor' | 'depositPaidAt' | 'paymentDueAt'>, now = new Date()) =>
  booking.status === 'REQUESTED' && booking.depositMinor > 0 && !booking.depositPaidAt && !!booking.paymentDueAt && booking.paymentDueAt.getTime() > now.getTime();

/** Lien de paiement de l'acompte (réutilisé tant que la session est valable). */
export const startDepositCheckout = (booking: BookingRow, resourceName: string, urls: { readonly successUrl: string; readonly cancelUrl: string }, now: Date = new Date()) =>
  Effect.gen(function* () {
    const currency = booking.depositCurrency.toUpperCase();
    if (!isCurrencyCode(currency)) return yield* new UnsupportedAmountError({ currency, amountMinor: booking.depositMinor, reason: 'currency' });
    return yield* startCheckout({
      organizationId: booking.organizationId, purpose: BOOKING_PAYMENT_PURPOSE, subjectId: booking.id,
      amount: { amountMinor: booking.depositMinor, currency }, description: `Acompte — ${resourceName}`.slice(0, 200),
      customerEmail: booking.customerEmail, successUrl: urls.successUrl, cancelUrl: urls.cancelUrl, ...(booking.paymentDueAt ? { expiresAt: booking.paymentDueAt } : {}),
      metadata: { bookingId: booking.id }, now,
    });
  });
