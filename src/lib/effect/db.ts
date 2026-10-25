/**
 * `Db` service: the single gateway from Effect code to Drizzle/Postgres.
 *
 *   const rows = yield* query('list sites', (db) => db.select().from(sites));
 *
 * Every query is wrapped in `Effect.tryPromise` and fails with `DbError`
 * (tagged with the operation name, for logs/traces).
 */
import { Context, Effect, Exit, Layer } from 'effect';
import { getDrizzle, type DrizzleDB } from '@/database/drizzle';
import { DbError } from './errors';

export interface DbShape {
  readonly drizzle: DrizzleDB;
  readonly query: <A>(operation: string, f: (db: DrizzleDB) => Promise<A>) => Effect.Effect<A, DbError>;
  readonly transaction: <A, E, R>(
    operation: string,
    f: (tx: DrizzleDB) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | DbError, R>;
}

export class Db extends Context.Service<Db, DbShape>()('polyweb/Db') {}

/** Shortcut: `yield* query('op', (db) => db.select()...)`. */
export const query = <A>(operation: string, f: (db: DrizzleDB) => Promise<A>): Effect.Effect<A, DbError, Db> =>
  Db.use((db) => db.query(operation, f));

/** Shortcut: run an Effect inside a DB transaction; `tx` is passed to `f`. */
export const transaction = <A, E, R>(
  operation: string,
  f: (tx: DrizzleDB) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | DbError, R | Db> => Db.use((db) => db.transaction(operation, f));

class TransactionAborted extends Error {}

export function makeDb(drizzle: DrizzleDB): DbShape {
  const query: DbShape['query'] = (operation, f) =>
    Effect.tryPromise({ try: () => f(drizzle), catch: (cause) => new DbError({ operation, cause }) }).pipe(
      Effect.withSpan(`db.${operation}`),
    );
  const transaction: DbShape['transaction'] = (operation, f) =>
    Effect.gen(function* () {
      const ctx = yield* Effect.context<never>();
      const outcome = yield* Effect.tryPromise({
        try: async () => {
          let failure: Exit.Failure<never, unknown> | undefined;
          try {
            const value = await drizzle.transaction(async (tx) => {
              const exit = await Effect.runPromiseExitWith(ctx)(f(tx as unknown as DrizzleDB) as Effect.Effect<unknown, unknown, never>);
              if (Exit.isFailure(exit)) {
                failure = exit as Exit.Failure<never, unknown>;
                throw new TransactionAborted();
              }
              return exit.value;
            });
            return { ok: true as const, value };
          } catch (error) {
            if (error instanceof TransactionAborted && failure) return { ok: false as const, failure };
            throw error;
          }
        },
        catch: (cause) => new DbError({ operation, cause }),
      });
      if (!outcome.ok) return yield* Effect.failCause(outcome.failure.cause);
      return outcome.value;
    }).pipe(Effect.withSpan(`db.tx.${operation}`)) as never;
  return { drizzle, query, transaction };
}

export const DbLive = Layer.sync(Db, () => makeDb(getDrizzle()));
