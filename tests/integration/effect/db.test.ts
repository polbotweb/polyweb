import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { sql } from 'drizzle-orm';
import { appRuntime } from '@/lib/effect/runtime';
import { query, transaction } from '@/lib/effect/db';
import { ConflictError, DbError } from '@/lib/effect/errors';

describe('Db service', () => {
  it('runs queries through the shared runtime', async () => {
    const r = await appRuntime.runPromise(query('select one', (db) => db.execute(sql`select 1 as one`)));
    expect(r.rows[0]).toEqual({ one: 1 });
  });

  it('wraps driver failures in DbError', async () => {
    const e = await appRuntime.runPromise(Effect.flip(query('bad', (db) => db.execute(sql`select * from nope_nope`))));
    expect(e).toBeInstanceOf(DbError);
    expect(e.operation).toBe('bad');
  });

  it('rolls back and re-surfaces typed failures from a transaction', async () => {
    await appRuntime.runPromise(query('mk', (db) => db.execute(sql`create temp table if not exists fx_tx (v int)`)));
    const program = transaction('tx', (tx) =>
      Effect.gen(function* () {
        yield* Effect.tryPromise(() => tx.execute(sql`insert into fx_tx values (1)`)).pipe(Effect.orDie);
        return yield* new ConflictError({ reason: 'stop' });
      }),
    );
    const e = await appRuntime.runPromise(Effect.flip(program));
    expect(e).toBeInstanceOf(ConflictError);
  });
});
