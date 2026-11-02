import { describe, expect, it } from 'vitest';
import { signUnsubscribeToken, verifyUnsubscribeToken, UNSUBSCRIBE_TTL_MS } from '@/core/notifications/unsubscribe';
import { validatePayload } from '@/smtp/send';
import { Effect, Exit } from 'effect';

const claims = { userId: 'u1', category: 'billing', channel: 'email' as const };

describe('unsubscribe token', () => {
  it('round-trips and expires', () => {
    const token = signUnsubscribeToken(claims, 's', 1000);
    expect(verifyUnsubscribeToken(token, 's', 2000)).toEqual({ ...claims, expiresAt: 1000 + UNSUBSCRIBE_TTL_MS });
    expect(verifyUnsubscribeToken(token, 's', 1000 + UNSUBSCRIBE_TTL_MS)).toBeNull();
  });
  it('rejects tampering, another secret and garbage', () => {
    const token = signUnsubscribeToken(claims, 's', 1000);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'u2', c: 'billing', ch: 'email', e: 9e15 })).toString('base64url');
    expect(verifyUnsubscribeToken(`${forged}.${sig}`, 's', 2000)).toBeNull();
    expect(verifyUnsubscribeToken(token, 'other', 2000)).toBeNull();
    expect(verifyUnsubscribeToken(`${body}.${sig}.x`, 's', 2000)).toBeNull();
    expect(verifyUnsubscribeToken('nope', 's', 2000)).toBeNull();
  });
});

describe('email headers validation', () => {
  const base = { to: 'a@example.test', subject: 's' };
  const ok = (p: Parameters<typeof validatePayload>[0]) => Exit.isSuccess(Effect.runSyncExit(validatePayload(p)));
  it('accepts List-Unsubscribe headers only, without line terminators', () => {
    expect(ok({ ...base, headers: { 'List-Unsubscribe': '<https://x/u>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } })).toBe(true);
    expect(ok({ ...base, headers: { 'List-Unsubscribe': '<x>\r\nBcc: e@x' } })).toBe(false);
    expect(ok({ ...base, headers: { Bcc: 'e@x' } as never })).toBe(false);
  });
});
