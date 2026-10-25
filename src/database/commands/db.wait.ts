/**
 * db:wait — attend que PostgreSQL réponde (repris de les-rochers-blancs scripts/db-wait.ts,
 * adapté à `pg` + getDbUrl()). Utile dans Docker/devcontainer/CI avant db:migrate.
 *   DB_WAIT_MAX_ATTEMPTS (défaut 30), DB_WAIT_DELAY_MS (défaut 2000)
 * Effect : chaque tentative est bornée (5 s) et rejouée via `Schedule.spaced`.
 */
import pg from 'pg';
import { Duration, Effect, Schedule } from 'effect';
import { getDbUrl, maskUrl } from '../env';
import { runScript, ScriptError, step } from './_effect';

const maxAttempts = Number.parseInt(process.env.DB_WAIT_MAX_ATTEMPTS ?? '30', 10);
const delayMs = Number.parseInt(process.env.DB_WAIT_DELAY_MS ?? '2000', 10);

const program = Effect.gen(function* () {
  if (!Number.isFinite(maxAttempts) || maxAttempts < 1) return yield* new ScriptError({ step: 'DB_WAIT_MAX_ATTEMPTS must be a positive integer' });
  if (!Number.isFinite(delayMs) || delayMs < 0) return yield* new ScriptError({ step: 'DB_WAIT_DELAY_MS must be a non-negative integer' });
  const url = getDbUrl();
  let attempt = 0;
  const probe = Effect.acquireUseRelease(
    Effect.sync(() => {
      attempt++;
      return new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
    }),
    (client) => step('connect', async () => {
      await client.connect();
      await client.query('select 1');
    }),
    (client) => Effect.promise(() => client.end().catch(() => undefined)),
  ).pipe(Effect.tapError(() => (attempt < maxAttempts ? Effect.sync(() => console.log(`Waiting for database... (${attempt}/${maxAttempts})`)) : Effect.void)));

  yield* probe.pipe(
    Effect.retry({ times: maxAttempts - 1, schedule: Schedule.spaced(Duration.millis(delayMs)) }),
    Effect.mapError((e) => new ScriptError({ step: `Database did not become reachable after ${maxAttempts} attempt(s)`, cause: e.cause })),
  );
  console.log(`Database reachable after ${attempt} attempt(s) (${maskUrl(url)}).`);
});

runScript('db:wait', program);
