import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the env module before importing send
vi.mock('@smtp/env', () => ({
  getSmtpProvider: vi.fn(),
  getSmtpFrom: vi.fn(() => ({ email: 'test@example.com', name: 'Test' })),
}));

// Mock all 3 provider modules
const mockBrevoSend = vi.fn();
const mockResendSend = vi.fn();
const mockNodemailerSend = vi.fn();

vi.mock('@smtp/providers/brevo', () => ({ send: mockBrevoSend }));
vi.mock('@smtp/providers/resend', () => ({ send: mockResendSend }));
vi.mock('@smtp/providers/nodemailer', () => ({ send: mockNodemailerSend }));

import { sendEmail } from '@smtp/send';
import { getSmtpProvider } from '@smtp/env';

const payload = { to: 'user@test.com', subject: 'Hello', html: '<p>Hi</p>' };

describe('sendEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes to BREVO provider', async () => {
    vi.mocked(getSmtpProvider).mockReturnValue('BREVO');
    await sendEmail(payload);
    expect(mockBrevoSend).toHaveBeenCalledOnce();
    expect(mockBrevoSend).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ email: 'test@example.com' }),
    );
  });

  it('routes to RESEND provider', async () => {
    vi.mocked(getSmtpProvider).mockReturnValue('RESEND');
    await sendEmail(payload);
    expect(mockResendSend).toHaveBeenCalledOnce();
    expect(mockResendSend).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ email: 'test@example.com' }),
    );
  });

  it('routes to NODEMAILER provider', async () => {
    vi.mocked(getSmtpProvider).mockReturnValue('NODEMAILER');
    await sendEmail(payload);
    expect(mockNodemailerSend).toHaveBeenCalledOnce();
    expect(mockNodemailerSend).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ email: 'test@example.com' }),
    );
  });

  it('does not call other providers when one is active', async () => {
    vi.mocked(getSmtpProvider).mockReturnValue('BREVO');
    await sendEmail(payload);
    expect(mockResendSend).not.toHaveBeenCalled();
    expect(mockNodemailerSend).not.toHaveBeenCalled();
  });

  it('passes correct from config to provider', async () => {
    vi.mocked(getSmtpProvider).mockReturnValue('NODEMAILER');
    await sendEmail(payload);
    expect(mockNodemailerSend).toHaveBeenCalledWith(
      payload,
      { email: 'test@example.com', name: 'Test' },
    );
  });

  it('retries on transient network error and eventually throws', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(getSmtpProvider).mockReturnValue('BREVO');
    const networkErr = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });
    mockBrevoSend.mockRejectedValue(networkErr);

    const promise = sendEmail(payload);
    // Attach handler early so the rejection during advanceTimers doesn't become unhandled
    promise.catch(() => {});

    // Flush retry delays: 1s, 2s
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).rejects.toThrow('connect failed');
    expect(mockBrevoSend).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('retries on HTTP 429 (rate limit)', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(getSmtpProvider).mockReturnValue('BREVO');
    mockBrevoSend
      .mockRejectedValueOnce(new Error('HTTP 429 Too Many Requests'))
      .mockResolvedValueOnce(undefined);

    const promise = sendEmail(payload);
    // Advance past first retry delay (1000ms * 2^0 = 1000ms)
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(mockBrevoSend).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('retries on HTTP 500/502/503/504 server errors', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(getSmtpProvider).mockReturnValue('RESEND');
    mockResendSend
      .mockRejectedValueOnce(new Error('HTTP 502 Bad Gateway'))
      .mockRejectedValueOnce(new Error('HTTP 503 Service Unavailable'))
      .mockResolvedValueOnce(undefined);

    const promise = sendEmail(payload);
    await vi.advanceTimersByTimeAsync(1000); // 1st retry delay
    await vi.advanceTimersByTimeAsync(2000); // 2nd retry delay
    await promise;

    expect(mockResendSend).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('retries on ETIMEDOUT, ENOTFOUND, ECONNRESET, EPIPE', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(getSmtpProvider).mockReturnValue('NODEMAILER');

    for (const code of ['ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EPIPE']) {
      vi.clearAllMocks();
      const err = Object.assign(new Error('network'), { code });
      mockNodemailerSend.mockRejectedValueOnce(err).mockResolvedValueOnce(undefined);

      const promise = sendEmail(payload);
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(mockNodemailerSend).toHaveBeenCalledTimes(2);
    }

    vi.useRealTimers();
  });

  it('verifies exponential backoff delay formula: 1000 * 2^(attempt-1)', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(getSmtpProvider).mockReturnValue('BREVO');
    const err = Object.assign(new Error('fail'), { code: 'ECONNREFUSED' });
    mockBrevoSend.mockRejectedValue(err);

    const promise = sendEmail(payload);
    promise.catch(() => {});

    // After 999ms: only attempt 1 should have been made (delay is 1000ms)
    await vi.advanceTimersByTimeAsync(999);
    expect(mockBrevoSend).toHaveBeenCalledTimes(1);

    // At 1000ms: attempt 2 fires
    await vi.advanceTimersByTimeAsync(1);
    expect(mockBrevoSend).toHaveBeenCalledTimes(2);

    // After 1999ms more: not yet (delay is 2000ms)
    await vi.advanceTimersByTimeAsync(1999);
    expect(mockBrevoSend).toHaveBeenCalledTimes(2);

    // At 2000ms: attempt 3 fires
    await vi.advanceTimersByTimeAsync(1);
    expect(mockBrevoSend).toHaveBeenCalledTimes(3);

    await expect(promise).rejects.toThrow();
    vi.useRealTimers();
  });

  it('does not retry on permanent auth error', async () => {
    vi.mocked(getSmtpProvider).mockReturnValue('RESEND');
    mockResendSend.mockRejectedValue(new Error('401 Unauthorized'));

    await expect(sendEmail(payload)).rejects.toThrow('401 Unauthorized');
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  it('rejects empty recipient email', async () => {
    await expect(sendEmail({ ...payload, to: '' }))
      .rejects.toThrow('Invalid recipient email address');
  });

  it('rejects malformed recipient email', async () => {
    await expect(sendEmail({ ...payload, to: 'not-an-email' }))
      .rejects.toThrow('Invalid recipient email address');
  });

  it('rejects email exceeding 254 characters', async () => {
    const longEmail = `${'a'.repeat(243)}@example.com`; // 255 chars
    await expect(sendEmail({ ...payload, to: longEmail }))
      .rejects.toThrow('Invalid recipient email address');
  });

  it('rejects subject containing LF', async () => {
    vi.mocked(getSmtpProvider).mockReturnValue('BREVO');
    await expect(sendEmail({ ...payload, subject: 'Hello\nBcc: evil@test.com' }))
      .rejects.toThrow('Invalid subject — contains line terminators');
    expect(mockBrevoSend).not.toHaveBeenCalled();
  });

  it('rejects subject containing CR', async () => {
    vi.mocked(getSmtpProvider).mockReturnValue('BREVO');
    await expect(sendEmail({ ...payload, subject: 'Hello\rBcc: evil@test.com' }))
      .rejects.toThrow('Invalid subject — contains line terminators');
    expect(mockBrevoSend).not.toHaveBeenCalled();
  });

  it('rejects subject containing CRLF', async () => {
    vi.mocked(getSmtpProvider).mockReturnValue('BREVO');
    await expect(sendEmail({ ...payload, subject: 'Hello\r\nBcc: evil@test.com' }))
      .rejects.toThrow('Invalid subject — contains line terminators');
    expect(mockBrevoSend).not.toHaveBeenCalled();
  });
});
