import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  }
  return { ActionError };
});
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => ({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 })) }));

const { effectHandler, fail, actionTry, actionRateLimit } = await import('@/lib/effect/action');
const { NotFoundError, DbError } = await import('@/lib/effect/errors');
const { ActionError } = await import('astro:actions');
const ctx = {} as never;

describe('effectHandler', () => {
  it('returns the success value', async () => {
    await expect(effectHandler((n: number) => Effect.succeed(n * 2))(21, ctx)).resolves.toBe(42);
  });
  it('maps ActionFailure to an ActionError with the same code and message', async () => {
    await expect(effectHandler(() => fail('CONFLICT', 'déjà pris'))(null, ctx)).rejects.toMatchObject({ code: 'CONFLICT', message: 'déjà pris' });
  });
  it('maps shared typed errors to ActionError codes', async () => {
    const err = await effectHandler(() => Effect.fail(new NotFoundError({ entity: 'Page' })))(null, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(ActionError);
    expect(err.code).toBe('NOT_FOUND');
  });
  it('rethrows the original cause for infrastructure errors', async () => {
    const cause = new Error('pg down');
    await expect(effectHandler(() => Effect.fail(new DbError({ operation: 'x', cause })))(null, ctx)).rejects.toBe(cause);
  });
  it('preserves an ActionError thrown by wrapped Promise code', async () => {
    const program = () => actionTry('tx', async () => { throw new ActionError({ code: 'NOT_FOUND', message: 'absent' }); });
    await expect(effectHandler(program)(null, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'absent' });
  });
  it('actionRateLimit fails with TOO_MANY_REQUESTS', async () => {
    await expect(effectHandler(() => actionRateLimit('u1', 'scope'))(null, ctx)).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });
});
