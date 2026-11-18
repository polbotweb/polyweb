// ─── SMTP Provider Types ─────────────────────────────────────────────

export type SmtpProvider = 'BREVO' | 'RESEND' | 'NODEMAILER';

export interface EmailFrom {
  email: string;
  name: string;
}

/** Pièce jointe d'un e-mail (contenu binaire, jamais d'URL distante). */
export interface EmailAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly content: Uint8Array;
}

/** Référence persistée dans l'outbox (contenu lu au moment de l'envoi depuis le stockage privé). */
export interface EmailAttachmentRef {
  readonly filename: string;
  readonly contentType: string;
  readonly storageKey: string;
}

export const EMAIL_ATTACHMENT_MAX_COUNT = 5;
export const EMAIL_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const EMAIL_ATTACHMENT_TYPES = ["application/pdf", "text/xml", "application/xml", "text/plain", "application/vnd.iso20022+xml"] as const;
export type EmailAttachmentType = (typeof EMAIL_ATTACHMENT_TYPES)[number];

export interface EmailPayload {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  /** En-têtes additionnels autorisés (désinscription en un clic, RFC 8058). */
  headers?: Partial<Record<EmailHeaderName, string>>;
  /** Pièces jointes optionnelles (PDF de BC, XML SEPA, etc.). */
  attachments?: readonly EmailAttachment[];
}

export const EMAIL_HEADER_NAMES = ['List-Unsubscribe', 'List-Unsubscribe-Post'] as const;
export type EmailHeaderName = (typeof EMAIL_HEADER_NAMES)[number];

export type ProviderSendFn = (payload: EmailPayload, from: EmailFrom) => Promise<void>;
