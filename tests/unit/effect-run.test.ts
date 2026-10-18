import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { DbError, OperationError } from '@/lib/effect/errors';
import { dbTry, runOrThrow } from '@/lib/effect/run';

describe('dbTry / runOrThrow (adaptateurs Effect → Promise)', () => {
  it('dbTry renvoie la valeur', async () => {
    expect(await Effect.runPromise(dbTry('t.ok', async () => 42))).toBe(42);
  });

  it('dbTry type l’échec en DbError avec la cause d’origine', async () => {
    const boom = new Error('db down');
    const r = await Effect.runPromise(Effect.result(dbTry('t.ko', async () => { throw boom; })));
    expect(r._tag).toBe('Failure');
    if (r._tag === 'Failure') {
      expect(r.failure).toBeInstanceOf(DbError);
      expect(r.failure.operation).toBe('t.ko');
      expect(r.failure.cause).toBe(boom);
    }
  });

  it('runOrThrow relève la cause d’origine d’un DbError / OperationError', async () => {
    const boom = new Error('original');
    await expect(runOrThrow(dbTry('t', async () => { throw boom; }))).rejects.toBe(boom);
    await expect(runOrThrow(Effect.fail(new OperationError({ operation: 'op', cause: boom })))).rejects.toBe(boom);
  });

  it('runOrThrow relève l’erreur typée si elle n’a pas de cause, et le défaut sinon', async () => {
    const typed = new OperationError({ operation: 'op' });
    await expect(runOrThrow(Effect.fail(typed))).rejects.toBe(typed);
    const defect = new TypeError('bug');
    await expect(runOrThrow(Effect.die(defect))).rejects.toBe(defect);
    expect(await runOrThrow(Effect.succeed('ok'))).toBe('ok');
  });
});
