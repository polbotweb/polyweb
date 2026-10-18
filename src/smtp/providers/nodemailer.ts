import nodemailer from 'nodemailer';
import type { EmailPayload, EmailFrom } from '../types';
import { getNodemailerConfig } from '../env';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  const cfg = getNodemailerConfig();

  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    connectionTimeout: 10_000,
    socketTimeout: 10_000,
    ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
  });

  return transporter;
}

export async function send(payload: EmailPayload, from: EmailFrom): Promise<void> {
  const safeName = from.name.replace(/[^a-zA-Z0-9 àâäéèêëïîôùûüÿçñ'\-]/g, '') || 'Atomic';
  await getTransporter().sendMail({
    from: `"${safeName}" <${from.email}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
}

export async function verify(): Promise<void> {
  await getTransporter().verify();
}
