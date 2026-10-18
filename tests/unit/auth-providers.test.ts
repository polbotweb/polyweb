import { describe, it, expect } from 'vitest';
import { getSocialProvidersConfig, getEnabledSocialProviders, getPasskeyConfig, isEmailOtpEnabled, getTwoFactorIssuer } from '@/lib/auth-providers';
import { signInOtpTemplate } from '@smtp/templates/sign-in-otp';

describe('auth-providers', () => {
  it('active un provider OAuth seulement si id ET secret sont fournis', () => {
    expect(getEnabledSocialProviders({})).toEqual([]);
    expect(getEnabledSocialProviders({ GITHUB_CLIENT_ID: 'x' })).toEqual([]);
    expect(getEnabledSocialProviders({ GITHUB_CLIENT_ID: 'x', GITHUB_CLIENT_SECRET: 'y', GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' })).toEqual(['github', 'google']);
    expect(getSocialProvidersConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' })).toEqual({ google: { clientId: 'a', clientSecret: 'b' } });
  });
  it('dérive le rpID passkey de BETTER_AUTH_URL, surcharge possible', () => {
    expect(getPasskeyConfig({ BETTER_AUTH_URL: 'https://cms.example.com/path' })).toEqual({ rpID: 'cms.example.com', rpName: 'Polyweb', origin: 'https://cms.example.com' });
    expect(getPasskeyConfig({ SITE_URL: 'https://a.test', PASSKEY_RP_ID: 'test', SITE_NAME: 'Acme' }).rpID).toBe('test');
  });
  it('emailOTP activé par défaut, désactivable', () => {
    expect(isEmailOtpEnabled({})).toBe(true);
    expect(isEmailOtpEnabled({ AUTH_EMAIL_OTP_ENABLED: 'false' })).toBe(false);
    expect(getTwoFactorIssuer({ SITE_NAME: 'Acme' })).toBe('Acme');
  });
  it('template OTP : code présent, échappé, localisé', () => {
    const fr = signInOtpTemplate({ locale: 'fr', code: '123456', purpose: 'sign-in', signInUrl: 'https://x.test/fr/auth/connexion', expiresInMinutes: 10 });
    expect(fr.subject).toContain('connexion');
    expect(fr.html).toContain('123456');
    expect(fr.text).toContain('10 minutes');
    const ar = signInOtpTemplate({ locale: 'ar', code: '<b>', purpose: 'sign-in', signInUrl: 'https://x.test', expiresInMinutes: 10 });
    expect(ar.html).toContain('dir="rtl"');
    expect(ar.html).not.toContain('<b>');
  });
});
