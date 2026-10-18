/**
 * Configuration des méthodes d'authentification additionnelles (brique h) :
 *   - OAuth GitHub / Google (activés si les variables d'environnement sont présentes)
 *   - Passkeys WebAuthn (rpID dérivé de BETTER_AUTH_URL / SITE_URL)
 *   - 2FA TOTP (issuer = SITE_NAME)
 *   - Connexion par code e-mail (emailOTP, AUTH_EMAIL_OTP_ENABLED, défaut true)
 * Module pur : pas d'import Better Auth, testable unitairement.
 */
export type SocialProviderId = 'github' | 'google';

export interface SocialProviderConfig { clientId: string; clientSecret: string }

type Env = Record<string, string | undefined>;

export function getSocialProvidersConfig(env: Env = process.env): Partial<Record<SocialProviderId, SocialProviderConfig>> {
  const out: Partial<Record<SocialProviderId, SocialProviderConfig>> = {};
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) out.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) out.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  return out;
}

export function getEnabledSocialProviders(env: Env = process.env): SocialProviderId[] {
  return Object.keys(getSocialProvidersConfig(env)) as SocialProviderId[];
}

export function getAppOrigin(env: Env = process.env): string {
  const raw = env.BETTER_AUTH_URL || env.SITE_URL || 'http://localhost:4321';
  try { return new URL(raw).origin; } catch { return 'http://localhost:4321'; }
}

export function getPasskeyConfig(env: Env = process.env): { rpID: string; rpName: string; origin: string } {
  const origin = getAppOrigin(env);
  return { rpID: env.PASSKEY_RP_ID || new URL(origin).hostname, rpName: env.SITE_NAME || 'Polyweb', origin };
}

export function getTwoFactorIssuer(env: Env = process.env): string {
  return env.SITE_NAME || 'Polyweb';
}

export function isEmailOtpEnabled(env: Env = process.env): boolean {
  return (env.AUTH_EMAIL_OTP_ENABLED ?? 'true') !== 'false';
}

export const EMAIL_OTP_EXPIRES_IN_SECONDS = 600;

/** Dernier OTP envoyé, exposé uniquement en NODE_ENV=test pour les tests d'intégration. */
const testOtpStore = new Map<string, string>();
export function rememberOtpForTests(email: string, otp: string): void {
  if (process.env.NODE_ENV === 'test') testOtpStore.set(email.toLowerCase(), otp);
}
export function getLastOtpForTests(email: string): string | undefined {
  return testOtpStore.get(email.toLowerCase());
}
