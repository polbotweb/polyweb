import type { EmailPayload, EmailFrom, SmtpProvider } from './types';
import { getSmtpProvider, getSmtpFrom } from './env';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RETRIES = 3;

async function callProvider(provider: SmtpProvider, payload: EmailPayload, from: EmailFrom): Promise<void> {
  switch (provider) {
    case 'BREVO': {
      const { send } = await import('./providers/brevo');
      return send(payload, from);
    }
    case 'RESEND': {
      const { send } = await import('./providers/resend');
      return send(payload, from);
    }
    case 'NODEMAILER': {
      const { send } = await import('./providers/nodemailer');
      return send(payload, from);
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Fournisseur SMTP inconnu : ${_exhaustive}`);
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EPIPE'].includes(code)) return true;
    if (/\b(429|500|502|503|504)\b/.test(err.message)) return true;
  }
  return false;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!payload.to || !EMAIL_RE.test(payload.to) || payload.to.length > 254) {
    throw new Error(`Invalid recipient email address`);
  }
  if (/[\r\n]/.test(payload.subject)) {
    throw new Error(`Invalid subject — contains line terminators`);
  }
  const provider = getSmtpProvider();
  const from = getSmtpFrom();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callProvider(provider, payload, from);
    } catch (err) {
      if (attempt === MAX_RETRIES || !isRetryable(err)) {
        // Dead-letter: log failed email for manual retry
        const logsDir = join(process.cwd(), 'logs');
        const dlPath = join(logsDir, `email-dead-letter-${new Date().toISOString().slice(0, 10)}.jsonl`);
        const record = JSON.stringify({
          timestamp: new Date().toISOString(),
          to: payload.to,
          subject: payload.subject,
          provider,
          error: (err as Error).name,
          code: (err as NodeJS.ErrnoException).code ?? null,
          attempts: attempt,
        });
        mkdir(logsDir, { recursive: true, mode: 0o700 })
          .then(() => appendFile(dlPath, record + '\n', { mode: 0o600 }))
          .catch((fileErr) => {
            console.error('[SMTP] Dead-letter write failed:', fileErr);
          });
        throw err;
      }
      const delay = 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 1000);
      console.warn(`[SMTP] Attempt ${attempt} failed, retrying in ${delay}ms...`, (err as Error).message);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
