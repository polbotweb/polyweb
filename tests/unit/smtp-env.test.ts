import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const BASE_ENV = {
  SMTP_PROVIDER: 'NODEMAILER',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '587',
  SMTP_USER: 'user',
  SMTP_PASS: 'pass',
  SMTP_FROM_EMAIL: 'noreply@example.com',
};

describe('getSmtpFrom — header injection defense', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, ...BASE_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects email with \\n character', async () => {
    process.env.SMTP_FROM_EMAIL = 'evil@example.com\nBcc: victim@test.com';
    const { getSmtpFrom } = await import('@smtp/env');
    expect(() => getSmtpFrom()).toThrow('SMTP_FROM_EMAIL invalide');
  });

  it('rejects email with \\r character', async () => {
    process.env.SMTP_FROM_EMAIL = 'evil@example.com\rBcc: victim@test.com';
    const { getSmtpFrom } = await import('@smtp/env');
    expect(() => getSmtpFrom()).toThrow('SMTP_FROM_EMAIL invalide');
  });

  it('rejects invalid email format', async () => {
    process.env.SMTP_FROM_EMAIL = 'not-an-email';
    const { getSmtpFrom } = await import('@smtp/env');
    expect(() => getSmtpFrom()).toThrow('SMTP_FROM_EMAIL invalide');
  });

  it('accepts valid email address', async () => {
    process.env.SMTP_FROM_EMAIL = 'noreply@example.com';
    const { getSmtpFrom } = await import('@smtp/env');
    const result = getSmtpFrom();
    expect(result.email).toBe('noreply@example.com');
    expect(result.name).toBe('Atomic');
  });

  it('uses custom SMTP_FROM_NAME when provided', async () => {
    process.env.SMTP_FROM_NAME = 'My App';
    const { getSmtpFrom } = await import('@smtp/env');
    const result = getSmtpFrom();
    expect(result.name).toBe('My App');
  });
});

// ─── getNodemailerConfig — port validation ────────────────────────

describe('getNodemailerConfig — port validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, ...BASE_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults to port 587', async () => {
    delete process.env.SMTP_PORT;
    const { getNodemailerConfig } = await import('@smtp/env');
    expect(getNodemailerConfig().port).toBe(587);
  });

  it('parses valid port', async () => {
    process.env.SMTP_PORT = '465';
    const { getNodemailerConfig } = await import('@smtp/env');
    expect(getNodemailerConfig().port).toBe(465);
  });

  it('rejects port 0', async () => {
    process.env.SMTP_PORT = '0';
    const { getNodemailerConfig } = await import('@smtp/env');
    expect(() => getNodemailerConfig()).toThrow('SMTP_PORT invalide');
  });

  it('rejects port > 65535', async () => {
    process.env.SMTP_PORT = '99999';
    const { getNodemailerConfig } = await import('@smtp/env');
    expect(() => getNodemailerConfig()).toThrow('SMTP_PORT invalide');
  });

  it('rejects non-numeric port', async () => {
    process.env.SMTP_PORT = 'abc';
    const { getNodemailerConfig } = await import('@smtp/env');
    expect(() => getNodemailerConfig()).toThrow('SMTP_PORT invalide');
  });

  it('returns secure=true when SMTP_SECURE=true', async () => {
    process.env.SMTP_SECURE = 'true';
    const { getNodemailerConfig } = await import('@smtp/env');
    expect(getNodemailerConfig().secure).toBe(true);
  });

  it('returns secure=false when SMTP_SECURE is not "true"', async () => {
    process.env.SMTP_SECURE = 'false';
    const { getNodemailerConfig } = await import('@smtp/env');
    expect(getNodemailerConfig().secure).toBe(false);
  });
});

// ─── getBrevoConfig / getResendConfig — missing API key ──────────

describe('getBrevoConfig / getResendConfig — missing API key', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, ...BASE_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('getBrevoConfig throws when BREVO_API_KEY is missing', async () => {
    delete process.env.BREVO_API_KEY;
    const { getBrevoConfig } = await import('@smtp/env');
    expect(() => getBrevoConfig()).toThrow('BREVO_API_KEY');
  });

  it('getBrevoConfig returns key when set', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test-key-12345';
    const { getBrevoConfig } = await import('@smtp/env');
    expect(getBrevoConfig().apiKey).toBe('xkeysib-test-key-12345');
  });

  it('getResendConfig throws when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;
    const { getResendConfig } = await import('@smtp/env');
    expect(() => getResendConfig()).toThrow('RESEND_API_KEY');
  });

  it('getResendConfig returns key when set', async () => {
    process.env.RESEND_API_KEY = 're_test_abc';
    const { getResendConfig } = await import('@smtp/env');
    expect(getResendConfig().apiKey).toBe('re_test_abc');
  });
});

// ─── SMTP_PROVIDER validation ───────────────────────────────────────

describe('SMTP_PROVIDER validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, ...BASE_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepts BREVO as provider', async () => {
    process.env.SMTP_PROVIDER = 'BREVO';
    const { getSmtpProvider } = await import('@smtp/env');
    expect(getSmtpProvider()).toBe('BREVO');
  });

  it('accepts RESEND as provider', async () => {
    process.env.SMTP_PROVIDER = 'RESEND';
    const { getSmtpProvider } = await import('@smtp/env');
    expect(getSmtpProvider()).toBe('RESEND');
  });

  it('normalizes lowercase provider name', async () => {
    process.env.SMTP_PROVIDER = 'brevo';
    const { getSmtpProvider } = await import('@smtp/env');
    expect(getSmtpProvider()).toBe('BREVO');
  });

  it('throws for invalid provider', async () => {
    process.env.SMTP_PROVIDER = 'MAILGUN';
    await expect(import('@smtp/env')).rejects.toThrow('SMTP_PROVIDER invalide');
  });
});
