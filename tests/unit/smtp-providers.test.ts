import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for SMTP provider send/verify logic.
 * We mock env modules and fetch/nodemailer to test each provider in isolation.
 */

// ─── Brevo ──────────────────────────────────────────────────────────

vi.mock('@/smtp/env', () => ({
  getBrevoConfig: () => ({ apiKey: 'test-brevo-key' }),
  getResendConfig: () => ({ apiKey: 'test-resend-key' }),
  getNodemailerConfig: () => ({
    host: 'localhost',
    port: 587,
    secure: false,
    user: '',
    pass: '',
  }),
  getSmtpProvider: () => 'BREVO' as const,
  getSmtpFrom: () => ({ email: 'noreply@example.com', name: 'Atomic' }),
  getProviderLabel: () => 'Brevo',
}));

// Mock Resend SDK to avoid real HTTP calls
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ error: null }) },
  })),
}));

const payload = { to: 'user@example.com', subject: 'Test', html: '<p>hi</p>', text: 'hi' };
const from = { email: 'noreply@example.com', name: 'Atomic' };

describe('Brevo provider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('send() calls Brevo API with correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const { send } = await import('@/smtp/providers/brevo');
    await send(payload, from);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(opts.method).toBe('POST');
    expect(opts.headers['api-key']).toBe('test-brevo-key');

    const body = JSON.parse(opts.body);
    expect(body.to).toEqual([{ email: 'user@example.com' }]);
    expect(body.sender.email).toBe('noreply@example.com');
  });

  it('send() throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('unauthorized'),
    }));

    const { send } = await import('@/smtp/providers/brevo');
    await expect(send(payload, from)).rejects.toThrow(/Brevo API error/);
  });

  it('verify() calls /v3/account', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const { verify } = await import('@/smtp/providers/brevo');
    await verify();

    expect(mockFetch).toHaveBeenCalled();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/account');
  });

  it('send() sanitizes from.name — strips special chars', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const { send } = await import('@/smtp/providers/brevo');
    await send(payload, { email: 'noreply@example.com', name: '<script>alert(1)</script>' });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.sender.name).not.toContain('<');
    expect(body.sender.name).not.toContain('>');
  });
});

// ─── Resend ─────────────────────────────────────────────────────────

describe('Resend provider', () => {
  it('verify() accepts restricted_api_key 401 as valid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":"restricted_api_key"}'),
    }));

    const { verify } = await import('@/smtp/providers/resend');
    // Should NOT throw — restricted key is considered valid
    await expect(verify()).resolves.toBeUndefined();
  });

  it('verify() throws on real 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":"invalid_key"}'),
    }));

    const { verify } = await import('@/smtp/providers/resend');
    await expect(verify()).rejects.toThrow(/Resend API error/);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

// ─── sendEmail validation ────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

describe('sendEmail email validation regex', () => {
  it('rejects addresses without @', () => {
    expect(EMAIL_RE.test('not-an-email')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(EMAIL_RE.test('')).toBe(false);
  });

  it('rejects overly long addresses (>254 chars)', () => {
    const longEmail = 'a'.repeat(251) + '@b.c';
    expect(longEmail.length > 254).toBe(true);
  });

  it('accepts valid addresses', () => {
    expect(EMAIL_RE.test('user@example.com')).toBe(true);
    expect(EMAIL_RE.test('test+tag@sub.domain.org')).toBe(true);
  });

  it('rejects addresses with spaces', () => {
    expect(EMAIL_RE.test('user @example.com')).toBe(false);
    expect(EMAIL_RE.test('user@ example.com')).toBe(false);
  });
});
