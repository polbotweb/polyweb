// ─── SMTP Provider Types ─────────────────────────────────────────────

export type SmtpProvider = 'BREVO' | 'RESEND' | 'NODEMAILER';

export interface EmailFrom {
  email: string;
  name: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  /** En-têtes additionnels autorisés (désinscription en un clic, RFC 8058). */
  headers?: Partial<Record<EmailHeaderName, string>>;
}

export const EMAIL_HEADER_NAMES = ['List-Unsubscribe', 'List-Unsubscribe-Post'] as const;
export type EmailHeaderName = (typeof EMAIL_HEADER_NAMES)[number];

export type ProviderSendFn = (payload: EmailPayload, from: EmailFrom) => Promise<void>;
