import { describe, expect, it } from 'vitest';
import { Effect, Schema } from 'effect';
import { decode, Slug } from '@/lib/effect/schema';
import { errorResponse } from '@/lib/effect/http';
import { NotFoundError, RateLimitedError, ValidationError, DbError } from '@/lib/effect/errors';
import { appConfigFrom } from '@/lib/effect/config';

describe('effect foundation', () => {
  const Input = Schema.Struct({ name: Schema.String.pipe(Schema.check(Schema.isMinLength(2))), slug: Slug });

  it('decode succeeds with typed value', async () => {
    const v = await Effect.runPromise(decode(Input)({ name: 'Hello', slug: 'hello-world', extra: 1 }));
    expect(v).toEqual({ name: 'Hello', slug: 'hello-world' });
  });

  it('decode collects field issues as ValidationError', async () => {
    const r = await Effect.runPromise(Effect.flip(decode(Input)({ name: 'x', slug: 'Bad Slug' })));
    expect(r).toBeInstanceOf(ValidationError);
    expect(r.issues.map((i) => i.path).sort()).toEqual(['name', 'slug']);
  });

  it('maps tagged errors to HTTP statuses without leaking internals', async () => {
    expect(errorResponse(new NotFoundError({ entity: 'Entry', id: 'x' })).status).toBe(404);
    const rl = errorResponse(new RateLimitedError({ retryAfterSeconds: 7 }));
    expect(rl.status).toBe(429);
    expect(rl.headers.get('retry-after')).toBe('7');
    const db = errorResponse(new DbError({ operation: 'q', cause: new Error('password=secret') }));
    expect(db.status).toBe(500);
    expect(await db.text()).not.toContain('secret');
    expect(errorResponse(new Error('boom')).status).toBe(500);
  });

  it('config refuses missing signing secret in production', () => {
    expect(() => appConfigFrom({ NODE_ENV: 'production' })).toThrow(/SIGNING_SECRET/);
    expect(appConfigFrom({ BETTER_AUTH_SECRET: 's' }).signingSecret).toBe('s');
  });
});
