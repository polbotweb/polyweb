/**
 * Signature HMAC-SHA256 des webhooks (brique d) + chiffrement du secret au repos.
 *
 * En-tête envoyé : `Polyweb-Signature: t=<unix>,v1=<hex>` où
 *   hex = HMAC_SHA256(secret, `${t}.${corps brut}`)
 * Côté récepteur : `verifyWebhookSignature(header, rawBody, secret)` (copiable
 * tel quel, sans dépendance) — tolérance d'horloge par défaut 5 min.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'Polyweb-Signature';

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

export function signPayload(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function signatureHeader(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${signPayload(secret, timestamp, body)}`;
}

export function verifyWebhookSignature(
  header: string | null | undefined,
  body: string,
  secret: string,
  opts: { toleranceSeconds?: number; now?: number } = {},
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isInteger(t) || !v1 || !/^[0-9a-f]{64}$/.test(v1)) return false;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(now - t) > (opts.toleranceSeconds ?? 300)) return false;
  const expected = Buffer.from(signPayload(secret, t, body), 'hex');
  return timingSafeEqual(expected, Buffer.from(v1, 'hex'));
}

// ─── Chiffrement du secret au repos ───────────────────────────────────

const keyFrom = (signingSecret: string) => createHash('sha256').update(`polyweb:webhook-secret:${signingSecret}`).digest();

export function encryptSecret(plain: string, signingSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(signingSecret), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

export function decryptSecret(encoded: string, signingSecret: string): string {
  const [v, iv, tag, ct] = encoded.split(':');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unsupported secret encoding');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(signingSecret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}
