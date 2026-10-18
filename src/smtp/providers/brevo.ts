import type { EmailPayload, EmailFrom } from '../types';
import { getBrevoConfig } from '../env';

const API_URL = 'https://api.brevo.com/v3/smtp/email';

export async function send(payload: EmailPayload, from: EmailFrom): Promise<void> {
  const { apiKey } = getBrevoConfig();
  const safeName = from.name.replace(/[^a-zA-Z0-9 àâäéèêëïîôùûüÿçñ'\-]/g, '') || 'Atomic';

  const body = {
    sender: { name: safeName, email: from.email },
    to: [{ email: payload.to }],
    subject: payload.subject,
    htmlContent: payload.html,
    textContent: payload.text,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[SMTP] Brevo send error ${res.status}:`, text.slice(0, 200));
    throw new Error(`Brevo API error (HTTP ${res.status})`);
  }
}

export async function verify(): Promise<void> {
  const { apiKey } = getBrevoConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': apiKey, 'Accept': 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[SMTP] Brevo verify error ${res.status}:`, text.slice(0, 200));
    throw new Error(`Brevo API error (HTTP ${res.status})`);
  }
}
