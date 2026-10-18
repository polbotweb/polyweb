/**
 * Exécution des commandes `db:*` en Effect : erreurs typées `ScriptError`,
 * code de sortie, libération du pool Drizzle et du runtime partagé.
 */
import { Cause, Data, Effect, Exit } from 'effect';
import type { PoolClient, QueryResultRow } from 'pg';
import { c } from './_utils';

export class ScriptError extends Data.TaggedError('ScriptError')<{ readonly step: string; readonly cause?: unknown }> {
  override get message() {
    const detail = this.cause instanceof Error ? this.cause.message : this.cause ? String(this.cause) : '';
    return `${this.step}${detail ? ` : ${detail}` : ''}`;
  }
}

/** Encapsule une étape Promise : un rejet devient `ScriptError`. */
export const step = <A>(name: string, f: () => Promise<A>) => Effect.tryPromise({ try: f, catch: (cause) => new ScriptError({ step: name, cause }) });

/**
 * Lance le programme puis termine le processus (0 succès, 1 échec).
 * `dispose` est toujours appelé (fermeture pool/runtime), même en cas d'échec.
 */
export function runScript<E>(name: string, program: Effect.Effect<void, E>, options: { dispose?: () => Promise<unknown> } = {}): void {
  void Effect.runPromiseExit(program).then(async (exit) => {
    await options.dispose?.().catch(() => undefined);
    if (Exit.isSuccess(exit)) process.exit(0);
    const fail = exit.cause.reasons.find((r) => r._tag === 'Fail');
    const error = fail && fail._tag === 'Fail' ? fail.error : undefined;
    console.error(c.red(`[${name}] échec :`), error instanceof Error ? error.message : error ?? Cause.pretty(exit.cause));
    process.exit(1);
  });
}

// ─── Briques communes des commandes (connexion, requêtes, transaction) ──────


/** Client pg emprunté au pool pour la durée de `use`, toujours rendu (succès, échec, interruption). */
export const withPgClient = <A, E>(
  acquire: () => Promise<PoolClient>,
  use: (client: PoolClient) => Effect.Effect<A, E>,
): Effect.Effect<A, E | ScriptError> =>
  Effect.acquireUseRelease(step('connexion', acquire), use, (client) => Effect.sync(() => client.release()));

/** Requête SQL nommée : un échec devient `ScriptError` (étape = libellé). */
export const sqlStep = <R extends QueryResultRow = QueryResultRow>(client: PoolClient, label: string, text: string, params?: unknown[]) =>
  step(label, () => client.query<R>(text, params));

/** BEGIN … COMMIT ; ROLLBACK (best effort) si le corps échoue. */
export const inTransaction = <A, E>(client: PoolClient, body: Effect.Effect<A, E>): Effect.Effect<A, E | ScriptError> =>
  Effect.gen(function* () {
    yield* sqlStep(client, 'BEGIN', 'BEGIN');
    const result = yield* body.pipe(Effect.onError(() => Effect.ignore(sqlStep(client, 'ROLLBACK', 'ROLLBACK'))));
    yield* sqlStep(client, 'COMMIT', 'COMMIT');
    return result;
  });
