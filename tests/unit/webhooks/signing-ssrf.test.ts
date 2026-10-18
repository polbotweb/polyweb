import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { decryptSecret, encryptSecret, generateWebhookSecret, signatureHeader, verifyWebhookSignature } from '@/modules/webhooks/domain/signing';
import { guardedLookup, isPrivateAddress, validateWebhookUrl } from '@/modules/webhooks/domain/ssrf';
import { backoffDelayMs } from '@/modules/webhooks/domain/dispatcher';
import { eventMatches } from '@/modules/webhooks/domain/webhooks';

describe('webhook signing', () => {
  const secret = generateWebhookSecret();
  const body = JSON.stringify({ a: 1 });
  const now = 1_700_000_000_000;
  const t = Math.floor(now / 1000);

  it('verifies a valid signature and rejects tampering / stale timestamps / wrong secret', () => {
    const header = signatureHeader(secret, t, body);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature(header, body, secret, { now })).toBe(true);
    expect(verifyWebhookSignature(header, body + ' ', secret, { now })).toBe(false);
    expect(verifyWebhookSignature(header, body, 'other', { now })).toBe(false);
    expect(verifyWebhookSignature(header, body, secret, { now: now + 301_000 })).toBe(false);
    expect(verifyWebhookSignature('garbage', body, secret, { now })).toBe(false);
    expect(verifyWebhookSignature(null, body, secret, { now })).toBe(false);
  });

  it('encrypts secrets at rest (AES-GCM, authenticated)', () => {
    const enc = encryptSecret(secret, 'k1');
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc, 'k1')).toBe(secret);
    expect(() => decryptSecret(enc, 'k2')).toThrow();
  });
});

describe('SSRF guard', () => {
  it('classifies private / reserved addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', 'not-an-ip']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('validates URLs statically', async () => {
    const strict = { allowPrivate: false, requireHttps: true };
    const bad = ['ftp://x.test', 'http://example.com', 'https://localhost/x', 'https://127.0.0.1/', 'https://[::1]/', 'https://user:pw@example.com/', 'https://metadata.internal/'];
    for (const u of bad) {
      const e = await Effect.runPromise(Effect.flip(validateWebhookUrl(u, strict)));
      expect(e._tag, u).toBe('ValidationError');
    }
    const ok = await Effect.runPromise(validateWebhookUrl('https://hooks.example.com/in', strict));
    expect(ok.hostname).toBe('hooks.example.com');
    await expect(Effect.runPromise(validateWebhookUrl('http://127.0.0.1:9/x', { allowPrivate: true, requireHttps: false }))).resolves.toBeInstanceOf(URL);
  });

  it('blocks hostnames resolving to private IPs at connect time (DNS rebinding)', async () => {
    const err = await new Promise<Error | null>((resolve) => guardedLookup(false)('localhost', {}, (e) => resolve(e)));
    expect(err?.message).toMatch(/Blocked private address/);
    const ok = await new Promise<Error | null>((resolve) => guardedLookup(true)('localhost', {}, (e) => resolve(e)));
    expect(ok).toBeNull();
  });
});

describe('dispatch helpers', () => {
  it('matches event patterns', () => {
    expect(eventMatches(['*'], 'content.published')).toBe(true);
    expect(eventMatches(['content.*'], 'content.published')).toBe(true);
    expect(eventMatches(['content.*'], 'form.submitted')).toBe(false);
    expect(eventMatches(['form.submitted'], 'form.submitted')).toBe(true);
  });
  it('backs off exponentially with jitter and a 6h cap', () => {
    expect(backoffDelayMs(1, () => 0.5)).toBe(30_000);
    expect(backoffDelayMs(3, () => 0.5)).toBe(120_000);
    expect(backoffDelayMs(30, () => 0.5)).toBe(6 * 3_600_000);
    expect(backoffDelayMs(1, () => 0)).toBe(27_000);
  });
});
