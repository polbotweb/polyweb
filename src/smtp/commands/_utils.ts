import { getSmtpProvider, getProviderLabel, getSmtpFrom, maskApiKey } from '../env';

// ─── ANSI Colors (reuse same pattern as database/_utils) ─────────────
export const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  bgRed: (s: string) => `\x1b[41m\x1b[97m${s}\x1b[0m`,
} as const;

// ─── Log SMTP target info ────────────────────────────────────────────
export function logSmtpTarget(): void {
  const provider = getSmtpProvider();
  const label = getProviderLabel();
  const from = getSmtpFrom();

  console.log(`${c.cyan('Provider :')} ${label}`);
  console.log(`${c.cyan('From     :')} "${from.name}" <${from.email}>`);

  if (provider === 'NODEMAILER') {
    const host = process.env.SMTP_HOST ?? 'localhost';
    const port = process.env.SMTP_PORT ?? '587';
    const secure = process.env.SMTP_SECURE === 'true'
      ? 'TLS directe'
      : (port === '465' ? '⚠️ port 465 nécessite SMTP_SECURE=true' : 'STARTTLS');
    console.log(`${c.cyan('Serveur  :')} ${host}:${port} (${secure})`);
    if (process.env.SMTP_USER) {
      console.log(`${c.cyan('Auth     :')} ${process.env.SMTP_USER}`);
    } else {
      console.log(`${c.cyan('Auth     :')} ${c.dim('aucune (mode relais)')}`);
    }
  }

  if (provider === 'BREVO') {
    const key = process.env.BREVO_API_KEY ?? '';
    console.log(`${c.cyan('API Key  :')} ${maskApiKey(key)}`);
  }

  if (provider === 'RESEND') {
    const key = process.env.RESEND_API_KEY ?? '';
    console.log(`${c.cyan('API Key  :')} ${maskApiKey(key)}`);
  }
}
