/**
 * Pipeline d'envoi d'email en Effect : validation → fournisseur (Brevo / Resend /
 * Nodemailer) → retries exponentiels avec jitter sur erreurs transitoires →
 * dead-letter JSONL (`logs/`) en cas d'échec définitif.
 *
 * `sendEmailEffect` est la primitive ; `sendEmail` reste un adaptateur Promise
 * pour les appelants historiques (actions Astro, hooks better-auth) et rejette
 * avec l'erreur d'origine du fournisseur.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Data, Duration, Effect, Exit, Schedule } from 'effect';
import type { EmailPayload, EmailFrom, SmtpProvider } from './types';
import { getSmtpProvider, getSmtpFrom } from './env';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RETRIES = 3;

/** Payload refusé avant tout appel réseau. */
export class InvalidEmailPayload extends Data.TaggedError('InvalidEmailPayload')<{ readonly reason: string }> {
  override get message() {
    return this.reason;
  }
}

/** Échec du fournisseur (après retries éventuels). `cause` est l'erreur d'origine. */
export class SmtpProviderError extends Data.TaggedError('SmtpProviderError')<{
  readonly provider: SmtpProvider;
  readonly cause: unknown;
  readonly retryable: boolean;
}> {}

async function callProvider(provider: SmtpProvider, payload: EmailPayload, from: EmailFrom): Promise<void> {
  switch (provider) {
    case 'BREVO':
      return (await import('./providers/brevo')).send(payload, from);
    case 'RESEND':
      return (await import('./providers/resend')).send(payload, from);
    case 'NODEMAILER':
      return (await import('./providers/nodemailer')).send(payload, from);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Fournisseur SMTP inconnu : ${_exhaustive}`);
    }
  }
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EPIPE'].includes(code)) return true;
    if (/\b(429|500|502|503|504)\b/.test(err.message)) return true;
  }
  return false;
}

export const validatePayload = (payload: EmailPayload) =>
  !payload.to || !EMAIL_RE.test(payload.to) || payload.to.length > 254
    ? Effect.fail(new InvalidEmailPayload({ reason: 'Invalid recipient email address' }))
    : /[\r\n]/.test(payload.subject)
      ? Effect.fail(new InvalidEmailPayload({ reason: 'Invalid subject — contains line terminators' }))
      : Effect.void;

const deadLetter = (payload: EmailPayload, error: SmtpProviderError, attempts: number) =>
  Effect.tryPromise(async () => {
    const logsDir = join(process.cwd(), 'logs');
    const record = JSON.stringify({
      timestamp: new Date().toISOString(),
      to: payload.to,
      subject: payload.subject,
      provider: error.provider,
      error: (error.cause as Error)?.name ?? 'Error',
      code: (error.cause as NodeJS.ErrnoException)?.code ?? null,
      attempts,
    });
    await mkdir(logsDir, { recursive: true, mode: 0o700 });
    await appendFile(join(logsDir, `email-dead-letter-${new Date().toISOString().slice(0, 10)}.jsonl`), record + '\n', { mode: 0o600 });
  }).pipe(Effect.catch((fileErr) => Effect.logError('[SMTP] Dead-letter write failed', fileErr)));

export const sendEmailEffect = (payload: EmailPayload, options: { readonly baseDelay?: Duration.Input } = {}) =>
  Effect.gen(function* () {
    yield* validatePayload(payload);
    const provider = getSmtpProvider();
    const from = getSmtpFrom();
    const base = Duration.fromInputUnsafe(options.baseDelay ?? Duration.seconds(1));
    let attempts = 0;
    yield* Effect.tryPromise({
      try: () => {
        attempts++;
        return callProvider(provider, payload, from);
      },
      catch: (cause) => new SmtpProviderError({ provider, cause, retryable: isRetryable(cause) }),
    }).pipe(
      Effect.tapError((error) =>
        error.retryable && attempts < MAX_RETRIES ? Effect.logWarning(`[SMTP] Attempt ${attempts} failed, retrying`, String(error.cause)) : Effect.void,
      ),
      Effect.retry({
        times: MAX_RETRIES - 1,
        // base · 2^(n-1) + jitter additif ∈ [0, base[ (identique au comportement historique : 1 s, 2 s + 0–1 s)
        schedule: Schedule.exponential(base).pipe(Schedule.addDelay(() => Effect.succeed(Duration.millis(Math.floor(Math.random() * Duration.toMillis(base)))))),
        while: (error) => error.retryable,
      }),
      Effect.tapError((error) => deadLetter(payload, error, attempts)),
    );
  }).pipe(Effect.withSpan('smtp.send', { attributes: { 'smtp.subject.length': payload.subject.length } }));

/** Adaptateur Promise : rejette avec l'erreur d'origine (fournisseur) ou une `Error` de validation. */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  const exit = await Effect.runPromiseExit(sendEmailEffect(payload));
  if (Exit.isSuccess(exit)) return;
  const fail = exit.cause.reasons.find((r) => r._tag === 'Fail');
  if (fail && fail._tag === 'Fail') {
    const error = fail.error;
    throw error._tag === 'SmtpProviderError' ? error.cause : new Error(error.reason);
  }
  throw new Error('[SMTP] unexpected failure');
}
