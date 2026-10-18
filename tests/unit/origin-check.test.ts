import { describe, expect, it } from 'vitest';
import { isForbiddenCrossOriginRequest } from '@/lib/security/origin-check';

const url = new URL('https://site.test/fr/admin/x');
const req = (method: string, headers: Record<string, string> = {}, u = url) => [new Request(u, { method, headers }), u] as const;

describe('origin check', () => {
  it('allows safe methods and same-origin forms', () => {
    expect(isForbiddenCrossOriginRequest(...req('GET'))).toBe(false);
    expect(isForbiddenCrossOriginRequest(...req('POST', { origin: 'https://site.test', 'content-type': 'application/x-www-form-urlencoded' }))).toBe(false);
  });
  it('blocks cross-site forms and bodyless unsafe requests without origin', () => {
    expect(isForbiddenCrossOriginRequest(...req('POST', { origin: 'https://evil.test', 'content-type': 'multipart/form-data; boundary=x' }))).toBe(true);
    expect(isForbiddenCrossOriginRequest(...req('DELETE'))).toBe(true);
  });
  it('allows JSON (preflighted) like Astro does', () => {
    expect(isForbiddenCrossOriginRequest(...req('POST', { origin: 'https://evil.test', 'content-type': 'application/json' }))).toBe(false);
  });
  it('exempts bearer calls to /api/v1 only', () => {
    const api = new URL('https://site.test/api/v1/content/a/b');
    expect(isForbiddenCrossOriginRequest(...req('DELETE', { authorization: 'Bearer pw_x' }, api))).toBe(false);
    expect(isForbiddenCrossOriginRequest(...req('DELETE', {}, api))).toBe(true);
    expect(isForbiddenCrossOriginRequest(...req('DELETE', { authorization: 'Bearer pw_x' }))).toBe(true);
    expect(isForbiddenCrossOriginRequest(...req('POST', { authorization: 'Bearer x', origin: 'https://evil.test', 'content-type': 'text/plain' }, new URL('https://site.test/api/upload')))).toBe(true);
  });
});
