/**
 * Service paiements du module (administration plateforme). Création de paiements,
 * webhooks et échéances : `@/core/payments` (bloc générique réutilisable par tout module).
 */
import { desc } from 'drizzle-orm';
import { Effect } from 'effect';
import { getDrizzle, type DrizzleDB } from '@database/drizzle';
import { payments, type Payment } from '@database/schemas/payments.schema';
import { dbTry } from '@/lib/effect/run';

export { isPaymentsEnabled, PaymentAmountMismatchError } from '@/core/payments';

/** Derniers paiements (toutes organisations) — réservé à l'administration plateforme. */
export const listPaymentsEffect = (limit = 50, deps: { db?: DrizzleDB } = {}) =>
  dbTry('payments.list', () => (deps.db ?? getDrizzle()).select().from(payments).orderBy(desc(payments.createdAt)).limit(Math.min(Math.max(limit, 1), 500)));

export const listPayments = (limit = 50, deps: { db?: DrizzleDB } = {}): Promise<Payment[]> => Effect.runPromise(listPaymentsEffect(limit, deps));
