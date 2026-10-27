/**
 * Réaction des réservations aux remboursements core/refunds (objet `booking`).
 *
 * Acompte remboursé en totalité → la réservation demandée ou confirmée passe `CANCELLED`
 * (créneau libéré). Un remboursement partiel (geste commercial) ou postérieur à l'arrivée ne
 * change pas le statut. Jamais d'échec : l'argent est déjà rendu.
 */
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { registerRefundHandler, type RefundOutcome } from '@/core/refunds';
import { canTransition } from '@/core/workflow';
import { dbTry } from '@/lib/effect/run';
import type { DbTransaction } from '@/lib/effect/transaction';
import { bookings } from './schema';
import { bookingWorkflow } from './domain/workflow';
import { BOOKING_PAYMENT_PURPOSE } from './payments';

const cancelRefunded = (tx: DbTransaction, outcome: RefundOutcome) =>
  Effect.gen(function* () {
    if (!outcome.fullyRefunded) return;
    const [booking] = yield* dbTry('bookings.refund.lock', () => tx.select().from(bookings).where(eq(bookings.id, outcome.subjectId)).limit(1).for('update'));
    if (!booking) return yield* Effect.logWarning('[bookings] remboursement pour une réservation inconnue', { refundId: outcome.refund.id });
    if (booking.status === 'CANCELLED' || !canTransition(bookingWorkflow, booking.status, 'CANCELLED')) return;
    yield* dbTry('bookings.refund.cancel', () => tx.update(bookings).set({ status: 'CANCELLED' }).where(eq(bookings.id, booking.id)));
  });

export const registerBookingRefunds = () => registerRefundHandler({ purpose: BOOKING_PAYMENT_PURPOSE, onSucceeded: cancelRefunded });
