/**
 * Transaction Drizzle pilotée par un Effect : le corps reçoit la transaction et renvoie un
 * Effect ; un échec typé (ou un défaut) annule la transaction (ROLLBACK) et l'erreur typée
 * d'origine est restituée telle quelle à l'appelant ; une erreur base devient `DbError`.
 * Indispensable aux numérotations sans trou (core/numbering) : le numéro n'est consommé
 * que si toute l'écriture aboutit.
 */
import { Effect, Exit } from 'effect';
import { getDrizzle, type DrizzleDB } from '@database/drizzle';
import { DbError } from './errors';

export type DbTransaction = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];

class TransactionAbort {
  constructor(readonly error: unknown) {}
}

export const dbTransaction = <A, E>(operation: string, body: (tx: DbTransaction) => Effect.Effect<A, E>): Effect.Effect<A, E | DbError> =>
  Effect.tryPromise({
    try: () =>
      getDrizzle().transaction(async (tx) => {
        const exit = await Effect.runPromiseExit(body(tx));
        if (Exit.isSuccess(exit)) return exit.value;
        const reason = exit.cause.reasons.find((r) => r._tag === 'Fail' || r._tag === 'Die');
        if (reason?._tag === 'Fail') throw new TransactionAbort(reason.error);
        throw reason?._tag === 'Die' ? reason.defect : new Error('Effect interrompu');
      }),
    catch: (cause) => (cause instanceof TransactionAbort ? (cause.error as E) : new DbError({ operation, cause })),
  }).pipe(Effect.withSpan(`db.tx.${operation}`));
