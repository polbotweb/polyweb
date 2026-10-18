/**
 * Adaptateurs Effect → Promise pour les contrats imposés par une bibliothèque ou
 * un registre ouvert (ex. `InternalLinkResolver`) : l'appelant Promise reçoit
 * l'erreur d'origine (cause de `DbError` / `OperationError`) plutôt qu'un
 * enrobage Effect, comme avant la migration.
 */
import { Effect, Exit } from 'effect';
import { DbError, OperationError } from './errors';

/**
 * Helper unique d'accès base en Effect (core) : requête Promise (Drizzle, cache…)
 * → `Effect<A, DbError>` avec la cause d'origine et un span (`db.<op>` par défaut).
 * `liftLoader` (src/database/loaders/effect.ts) et `core/locks` reposent dessus.
 */
export const dbTry = <A>(operation: string, f: () => Promise<A>, span = `db.${operation}`): Effect.Effect<A, DbError> =>
  Effect.tryPromise({ try: f, catch: (cause) => new DbError({ operation, cause }) }).pipe(Effect.withSpan(span));

/** Exécute l'Effect ; en échec, relève la cause d'origine (ou l'erreur typée) / le défaut. */
export async function runOrThrow<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const reason = exit.cause.reasons.find((r) => r._tag === 'Fail' || r._tag === 'Die');
  if (reason?._tag === 'Fail') {
    const error = reason.error;
    throw (error instanceof DbError || error instanceof OperationError) && error.cause !== undefined ? error.cause : error;
  }
  throw reason?._tag === 'Die' ? reason.defect : new Error('Effect interrompu');
}
