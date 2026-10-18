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
}

export type ProviderSendFn = (payload: EmailPayload, from: EmailFrom) => Promise<void>;
