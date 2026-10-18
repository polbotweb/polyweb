import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerSend = vi.fn();
vi.mock('@smtp/env', () => ({
  getSmtpProvider: () => 'NODEMAILER',
  getSmtpFrom: () => ({ name: 'Polyweb', email: 'noreply@polyweb.test' }),
}));
vi.mock('@smtp/providers/nodemailer', () => ({ send: (...args: unknown[]) => providerSend(...args) }));
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(async () => undefined), appendFile: vi.fn(async () => undefined) }));

const { sendEmailEffect, sendEmail, isRetryable } = await import('@smtp/send');
const fs = await import('node:fs/promises');

const payload = { to: 'a@b.test', subject: 'Hello', html: '<p>x</p>', text: 'x' };

describe('sendEmailEffect', () => {
  beforeEach(() => {
    providerSend.mockReset();
    vi.mocked(fs.appendFile).mockClear();
  });

  it('rejects an invalid recipient with a typed error, without calling the provider', async () => {
    const result = await Effect.runPromise(Effect.result(sendEmailEffect({ ...payload, to: 'nope' })));
    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') expect(result.failure._tag).toBe('InvalidEmailPayload');
    expect(providerSend).not.toHaveBeenCalled();
  });

  it('rejects a subject containing CRLF', async () => {
    await expect(sendEmail({ ...payload, subject: 'a\r\nBcc: x' })).rejects.toThrow(/line terminators/);
  });

  it('retries transient errors then succeeds', async () => {
    providerSend.mockRejectedValueOnce(Object.assign(new Error('conn'), { code: 'ECONNRESET' })).mockResolvedValueOnce(undefined);
    await Effect.runPromise(sendEmailEffect(payload, { baseDelay: 1 }));
    expect(providerSend).toHaveBeenCalledTimes(2);
    expect(fs.appendFile).not.toHaveBeenCalled();
  });

  it('gives up after 3 attempts and writes a dead-letter record', async () => {
    providerSend.mockRejectedValue(new Error('HTTP 503'));
    const result = await Effect.runPromise(Effect.result(sendEmailEffect(payload, { baseDelay: 1 })));
    expect(result._tag).toBe('Failure');
    expect(providerSend).toHaveBeenCalledTimes(3);
    expect(fs.appendFile).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fs.appendFile).mock.calls[0]?.[1])).toContain('"attempts":3');
  });

  it('does not retry permanent errors and the Promise adapter rethrows the original error', async () => {
    const original = new Error('bad credentials');
    providerSend.mockRejectedValue(original);
    await expect(sendEmail(payload)).rejects.toBe(original);
    expect(providerSend).toHaveBeenCalledTimes(1);
    expect(isRetryable(original)).toBe(false);
  });
});
