import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/sites/domain/sites', () => ({ resolveSiteForHostEffect: vi.fn() }));
const sites = await import('@/modules/sites/domain/sites');
const { resolveSession, resolveSite, requestHost, serviceUnavailable } = await import('@/lib/http/request-context');

describe('request context (middleware)', () => {
  it('resolves the session', async () => {
    const r = await Effect.runPromise(resolveSession(async () => ({ user: { id: 'u' } })));
    expect(r).toEqual({ _tag: 'Resolved', session: { user: { id: 'u' } } });
  });
  it('treats a failing session lookup as anonymous', async () => {
    const r = await Effect.runPromise(resolveSession(async () => { throw new Error('db down'); }));
    expect(r).toEqual({ _tag: 'Resolved', session: null });
  });
  it('times out a slow session lookup', async () => {
    const slow = () => new Promise<{ id: string }>((resolve) => setTimeout(() => resolve({ id: 'late' }), 200));
    const r = await Effect.runPromise(resolveSession(slow, 20));
    expect(r._tag).toBe('TimedOut');
  });
  it('503 response carries Retry-After', () => {
    const res = serviceUnavailable();
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('5');
  });
  it('uses X-Forwarded-Host only behind a trusted proxy', () => {
    const h = new Headers({ host: 'a.test', 'x-forwarded-host': 'b.test' });
    expect(requestHost(h, false)).toBe('a.test');
    expect(requestHost(h, true)).toBe('b.test');
  });
  it('falls back to null when site resolution fails', async () => {
    const { DbError } = await import('@/lib/effect/errors');
    vi.mocked(sites.resolveSiteForHostEffect).mockReturnValue(Effect.fail(new DbError({ operation: 'x', cause: 'down' })) as never);
    expect(await Effect.runPromise(resolveSite('a.test'))).toBeNull();
  });
});
