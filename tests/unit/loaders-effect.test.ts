import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { liftLoader } from '@/database/loaders/effect';

describe('liftLoader (façade Effect des loaders)', () => {
  it('renvoie la valeur du loader', async () => {
    const load = liftLoader('test.ok', async (a: number, b: number = 2) => a + b);
    expect(await Effect.runPromise(load(1))).toBe(3);
  });

  it("type l'échec en DbError en conservant la cause", async () => {
    const boom = new Error('db down');
    const load = liftLoader('test.ko', async () => {
      throw boom;
    });
    const r = await Effect.runPromise(Effect.result(load()));
    expect(r._tag).toBe('Failure');
    if (r._tag === 'Failure') {
      expect(r.failure._tag).toBe('DbError');
      expect(r.failure.operation).toBe('test.ko');
      expect(r.failure.cause).toBe(boom);
    }
  });
});
