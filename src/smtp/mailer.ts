/**
 * Service `Mailer` (Effect) — enveloppe le pipeline SMTP existant
 * (`sendEmail` : Brevo / Resend / Nodemailer, retries, dead-letter).
 * Timeout global par message ; erreurs typées `MailError`.
 */
import { Context, Data, Duration, Effect, Layer } from 'effect';
import { sendEmail } from './send';
import type { EmailPayload } from './types';

export class MailError extends Data.TaggedError('MailError')<{ readonly to: string; readonly cause: unknown }> {
  override get message() {
    return `Email to ${this.to} failed`;
  }
}

export interface MailerShape {
  readonly send: (payload: EmailPayload) => Effect.Effect<void, MailError>;
}

export class Mailer extends Context.Service<Mailer, MailerShape>()('polyweb/Mailer') {}

const TIMEOUT = Duration.seconds(30);

export const MailerLive = Layer.succeed(Mailer, {
  send: (payload) =>
    Effect.tryPromise({ try: () => sendEmail(payload), catch: (cause) => new MailError({ to: payload.to, cause }) }).pipe(
      Effect.timeoutOrElse({ duration: TIMEOUT, orElse: () => Effect.fail(new MailError({ to: payload.to, cause: 'timeout' })) }),
      Effect.withSpan('mail.send'),
    ),
});

/** Mailer de test : enregistre les messages au lieu de les envoyer. */
export function makeMemoryMailer(): MailerShape & { readonly sent: EmailPayload[] } {
  const sent: EmailPayload[] = [];
  return { sent, send: (payload) => Effect.sync(() => void sent.push(payload)) };
}
