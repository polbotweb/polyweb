import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { extractIp } from '@/lib/audit';

describe('extractIp', () => {
  const originalTrustProxy = process.env.TRUST_PROXY;
  beforeAll(() => { process.env.TRUST_PROXY = 'true'; });
  afterAll(() => {
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = originalTrustProxy;
  });

  it('returns first IP from x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(extractIp(headers)).toBe('1.2.3.4');
  });

  it('returns single x-forwarded-for value', () => {
    const headers = new Headers({ 'x-forwarded-for': '10.0.0.1' });
    expect(extractIp(headers)).toBe('10.0.0.1');
  });

  it('falls back to x-real-ip when no x-forwarded-for', () => {
    const headers = new Headers({ 'x-real-ip': '192.168.0.1' });
    expect(extractIp(headers)).toBe('192.168.0.1');
  });

  it('prefers x-forwarded-for over x-real-ip', () => {
    const headers = new Headers({
      'x-forwarded-for': '1.1.1.1',
      'x-real-ip': '2.2.2.2',
    });
    expect(extractIp(headers)).toBe('1.1.1.1');
  });

  it('returns null when no IP headers present', () => {
    const headers = new Headers();
    expect(extractIp(headers)).toBeNull();
  });

  it('trims whitespace from forwarded IP', () => {
    const headers = new Headers({ 'x-forwarded-for': '  3.3.3.3 , 4.4.4.4' });
    expect(extractIp(headers)).toBe('3.3.3.3');
  });

  it('handles IPv6 loopback in x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '::1' });
    expect(extractIp(headers)).toBe('::1');
  });

  it('handles full IPv6 address in x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '2001:db8::1, ::1' });
    expect(extractIp(headers)).toBe('2001:db8::1');
  });

  it('returns null for XSS attempt in x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '<script>alert(1)</script>' });
    expect(extractIp(headers)).toBeNull();
  });

  it('returns null for non-IP string in x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': 'not-an-ip' });
    expect(extractIp(headers)).toBeNull();
  });

  it('returns null for empty x-forwarded-for value', () => {
    const headers = new Headers({ 'x-forwarded-for': '' });
    expect(extractIp(headers)).toBeNull();
  });

  it('returns null for invalid x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': 'DROP TABLE users;--' });
    expect(extractIp(headers)).toBeNull();
  });

  it('uses clientAddress fallback when no proxy headers', () => {
    const headers = new Headers();
    expect(extractIp(headers, '127.0.0.1')).toBe('127.0.0.1');
  });

  it('uses clientAddress fallback with IPv6', () => {
    const headers = new Headers();
    expect(extractIp(headers, '::1')).toBe('::1');
  });

  it('prefers proxy header over clientAddress', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4' });
    expect(extractIp(headers, '127.0.0.1')).toBe('1.2.3.4');
  });

  it('ignores invalid clientAddress', () => {
    const headers = new Headers();
    expect(extractIp(headers, 'not-an-ip')).toBeNull();
  });

  it('returns null when clientAddress is undefined', () => {
    const headers = new Headers();
    expect(extractIp(headers, undefined)).toBeNull();
  });
});

describe('extractIp without TRUST_PROXY', () => {
  const originalTrustProxy = process.env.TRUST_PROXY;
  beforeAll(() => { delete process.env.TRUST_PROXY; });
  afterAll(() => {
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = originalTrustProxy;
  });

  it('ignores proxy headers when TRUST_PROXY is not set', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4' });
    expect(extractIp(headers)).toBeNull();
  });

  it('still uses clientAddress fallback without TRUST_PROXY', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4' });
    expect(extractIp(headers, '192.168.0.1')).toBe('192.168.0.1');
  });
});
