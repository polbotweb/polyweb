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

/** Effets à lancer après COMMIT, par transaction (abandonnés sur ROLLBACK). */
const pendingAfterCommit = new WeakMap<object, Array<Effect.Effect<unknown, unknown>>>();

/**
 * Programme un effet après la validation de `tx` (ex. diffusion de l'outbox d'événements).
 * Jamais exécuté si la transaction est annulée ; ses erreurs sont journalisées, sans effet
 * sur le résultat de la transaction déjà validée.
 */
export const afterCommit = (tx: DbTransaction, effect: Effect.Effect<unknown, unknown>): Effect.Effect<void> =>
  Effect.sync(() => {
    const list = pendingAfterCommit.get(tx);
    if (list) list.push(effect);
    else pendingAfterCommit.set(tx, [effect]);
  });

const flushAfterCommit = (effects: ReadonlyArray<Effect.Effect<unknown, unknown>>) =>
  Effect.forEach(effects, (effect) => effect.pipe(Effect.catchCause((cause) => Effect.logError('[db] after-commit hook failed', cause))), { discard: true });

class TransactionAbort {
  constructor(readonly error: unknown) {}
}

export const dbTransaction = <A, E>(operation: string, body: (tx: DbTransaction) => Effect.Effect<A, E>): Effect.Effect<A, E | DbError> =>
  Effect.tryPromise({
    try: () =>
      getDrizzle().transaction(async (tx) => {
        const exit = await Effect.runPromiseExit(body(tx));
        if (Exit.isSuccess(exit)) return { value: exit.value, hooks: pendingAfterCommit.get(tx) ?? [] };
        const reason = exit.cause.reasons.find((r) => r._tag === 'Fail' || r._tag === 'Die');
        if (reason?._tag === 'Fail') throw new TransactionAbort(reason.error);
        throw reason?._tag === 'Die' ? reason.defect : new Error('Effect interrompu');
      }),
    catch: (cause) => (cause instanceof TransactionAbort ? (cause.error as E) : new DbError({ operation, cause })),
  }).pipe(
    Effect.flatMap(({ value, hooks }) => flushAfterCommit(hooks).pipe(Effect.as(value))),
    Effect.withSpan(`db.tx.${operation}`),
  );
