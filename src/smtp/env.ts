import { config } from 'dotenv';
import path from 'path';
import type { SmtpProvider, EmailFrom } from './types';

config({ path: path.resolve(process.cwd(), '.env') });

// ─── Types ───────────────────────────────────────────────────────────
export interface NodemailerConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface BrevoConfig {
  apiKey: string;
}

export interface ResendConfig {
  apiKey: string;
}

// ─── Constants ───────────────────────────────────────────────────────
const SMTP_PROVIDERS: SmtpProvider[] = ['BREVO', 'RESEND', 'NODEMAILER'];

const PROVIDER_LABELS: Record<SmtpProvider, string> = {
  BREVO: 'Brevo (API v3)',
  RESEND: 'Resend (SDK)',
  NODEMAILER: 'Nodemailer (SMTP)',
};

// ─── Active provider (single source of truth) ───────────────────────
const ACTIVE_PROVIDER: SmtpProvider = (() => {
  const raw = process.env.SMTP_PROVIDER;

  if (raw === undefined) {
    console.warn(`\x1b[33m⚠️  SMTP_PROVIDER non défini dans .env — défaut : NODEMAILER\x1b[0m`);
    console.warn(`\x1b[2m   Ajoutez SMTP_PROVIDER=BREVO|RESEND|NODEMAILER dans votre fichier .env\x1b[0m`);
    return 'NODEMAILER';
  }

  if (raw.trim() === '') {
    console.warn(`\x1b[33m⚠️  SMTP_PROVIDER est vide dans .env — défaut : NODEMAILER\x1b[0m`);
    console.warn(`\x1b[2m   Valeurs acceptées : ${SMTP_PROVIDERS.join(', ')}\x1b[0m`);
    return 'NODEMAILER';
  }

  const normalized = raw.trim().toUpperCase();
  if (SMTP_PROVIDERS.includes(normalized as SmtpProvider)) return normalized as SmtpProvider;

  throw new Error(`SMTP_PROVIDER invalide : "${raw}". Valeurs acceptées : ${SMTP_PROVIDERS.join(', ')}`);
})();

// ─── Helpers ─────────────────────────────────────────────────────────
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(`Variable d'environnement manquante : ${name} (provider actif : ${ACTIVE_PROVIDER})`);
  }
  return val.trim();
}

// ─── Public API ─────────────────────────────────────────────────────
export const getSmtpProvider = (): SmtpProvider => ACTIVE_PROVIDER;
export const getProviderLabel = (): string => PROVIDER_LABELS[ACTIVE_PROVIDER];

export function getSmtpFrom(): EmailFrom {
  const email = requireEnv('SMTP_FROM_EMAIL');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`SMTP_FROM_EMAIL invalide : "${email}"`);
  }
  if (/[\r\n]/.test(email)) {
    throw new Error(`SMTP_FROM_EMAIL contient des caractères invalides (retour à la ligne)`);
  }
  return {
    email,
    name: process.env.SMTP_FROM_NAME?.trim() || 'Atomic',
  };
}

export function getNodemailerConfig(): NodemailerConfig {
  const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`SMTP_PORT invalide : "${process.env.SMTP_PORT}". Doit être entre 1 et 65535.`);
  }
  return {
    host: requireEnv('SMTP_HOST'),
    port,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER?.trim() ?? '',
    pass: process.env.SMTP_PASS?.trim() ?? '',
  };
}

export function getBrevoConfig(): BrevoConfig {
  return { apiKey: requireEnv('BREVO_API_KEY') };
}

export function getResendConfig(): ResendConfig {
  return { apiKey: requireEnv('RESEND_API_KEY') };
}

/** Masque une clé API pour les logs */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return '***';
  return key.substring(0, 4) + '...' + key.substring(key.length - 4);
}

/** Lightweight SMTP config check for health probes (no network call). */
export function checkSmtpConfig(): { ok: boolean; provider: string; error?: string } {
  const provider = ACTIVE_PROVIDER;
  try {
    getSmtpFrom();
    if (provider === 'NODEMAILER') getNodemailerConfig();
    else if (provider === 'BREVO') getBrevoConfig();
    else if (provider === 'RESEND') getResendConfig();
    return { ok: true, provider };
  } catch (err) {
    return { ok: false, provider, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
