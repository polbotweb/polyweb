/**
 * Lien de désinscription signé (N5-A) : jeton `payload.signature` en base64url,
 * HMAC-SHA256 d'une clé dérivée du secret de signature, avec date d'expiration.
 * Le jeton désigne un utilisateur, une catégorie et un canal ; il ne contient pas d'email.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Effect } from 'effect';
import { AppConfig } from '@/lib/effect/config';
import type { NotificationChannel } from './registry';

export const UNSUBSCRIBE_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export interface UnsubscribeClaims {
  readonly userId: string;
  readonly category: string;
  readonly channel: NotificationChannel;
  readonly expiresAt: number;
}

const keyFrom = (secret: string) => createHash('sha256').update(`polyweb:notifications-unsubscribe:${secret}`).digest();
const sign = (body: string, secret: string) => createHmac('sha256', keyFrom(secret)).update(body).digest('base64url');

export function signUnsubscribeToken(claims: Omit<UnsubscribeClaims, 'expiresAt'>, secret: string, now = Date.now(), ttlMs = UNSUBSCRIBE_TTL_MS): string {
  const body = Buffer.from(JSON.stringify({ u: claims.userId, c: claims.category, ch: claims.channel, e: now + ttlMs })).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifyUnsubscribeToken(token: string, secret: string, now = Date.now()): UnsubscribeClaims | null {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined || token.length > 1024) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const raw = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { u?: unknown; c?: unknown; ch?: unknown; e?: unknown };
    if (typeof raw.u !== 'string' || typeof raw.c !== 'string' || (raw.ch !== 'email' && raw.ch !== 'in_app') || typeof raw.e !== 'number') return null;
    if (raw.e <= now) return null;
    return { userId: raw.u, category: raw.c, channel: raw.ch, expiresAt: raw.e };
  } catch {
    return null;
  }
}

/** URL publique de désinscription (page + POST un clic RFC 8058) pour un destinataire. */
export const unsubscribeUrl = (claims: Omit<UnsubscribeClaims, 'expiresAt'>, locale: string) =>
  AppConfig.use((config) =>
    Effect.succeed(`${config.siteUrl}/${locale}/notifications/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(claims, config.signingSecret))}`),
  );
