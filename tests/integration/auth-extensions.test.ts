/**
 * Brique h — 2FA TOTP, connexion par code e-mail (emailOTP), passkeys.
 * Exécute les vrais endpoints Better Auth contre Postgres.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDrizzle, schema } from '@database/drizzle';
import { getLastOtpForTests } from '@/lib/auth-providers';
import { createVerifiedUser, signInCookie, removeUsers } from '../helpers/auth-users';

const created: string[] = [];

/** L'URI otpauth contient le secret encodé en base32 ; generateTOTP attend le secret brut. */
function base32Decode(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of input.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes).toString('utf8');
}
const secretOf = (uri: string) => base32Decode(new URL(uri).searchParams.get('secret')!);
afterAll(() => removeUsers(created));

const cookieFrom = (res: Response) =>
  (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

describe('2FA TOTP', () => {
  it('active la 2FA, impose l’étape TOTP à la connexion et accepte un code valide', async () => {
    const u = await createVerifiedUser('totp');
    created.push(u.id);
    const headers = new Headers({ cookie: await signInCookie(u.email, u.password) });

    const res2fa = await auth.api.enableTwoFactor({ body: { password: u.password }, headers });
    if (res2fa.method !== 'totp') throw new Error('expected TOTP');
    const enabled = res2fa;
    expect(enabled.totpURI).toMatch(/^otpauth:\/\/totp\//);
    expect(enabled.backupCodes.length).toBeGreaterThan(0);
    const secret = secretOf(enabled.totpURI);

    const { code } = await auth.api.generateTOTP({ body: { secret } });
    await auth.api.verifyTOTP({ body: { code }, headers });
    const [row] = await getDrizzle().select().from(schema.user).where(eq(schema.user.id, u.id));
    expect(row?.twoFactorEnabled).toBe(true);

    // Connexion par mot de passe → redirection 2FA, pas de session
    const signIn = await auth.api.signInEmail({ body: { email: u.email, password: u.password }, asResponse: true });
    const body = await signIn.json();
    expect(body.twoFactorRedirect).toBe(true);
    const twoFactorCookie = cookieFrom(signIn);
    expect(twoFactorCookie).toContain('two_factor');
    expect(twoFactorCookie).not.toMatch(/session_token=[^;]/); // cookie de session vidé

    // Mauvais code refusé
    await expect(auth.api.verifyTOTP({ body: { code: '000000' }, headers: new Headers({ cookie: twoFactorCookie }) })).rejects.toThrow();

    // Bon code → session
    const fresh = await auth.api.generateTOTP({ body: { secret } });
    const verified = await auth.api.verifyTOTP({ body: { code: fresh.code }, headers: new Headers({ cookie: twoFactorCookie }), asResponse: true });
    expect(verified.status).toBe(200);
    expect(cookieFrom(verified)).toContain('session_token=');
  });

  it('un code de secours permet de terminer la connexion', async () => {
    const u = await createVerifiedUser('backup');
    created.push(u.id);
    const headers = new Headers({ cookie: await signInCookie(u.email, u.password) });
    const res2fa = await auth.api.enableTwoFactor({ body: { password: u.password }, headers });
    if (res2fa.method !== 'totp') throw new Error('expected TOTP');
    const enabled = res2fa;
    const secret = secretOf(enabled.totpURI);
    await auth.api.verifyTOTP({ body: { code: (await auth.api.generateTOTP({ body: { secret } })).code }, headers });

    const signIn = await auth.api.signInEmail({ body: { email: u.email, password: u.password }, asResponse: true });
    const res = await auth.api.verifyBackupCode({ body: { code: enabled.backupCodes[0]! }, headers: new Headers({ cookie: cookieFrom(signIn) }), asResponse: true });
    expect(res.status).toBe(200);
    expect(cookieFrom(res)).toContain('session_token=');
  });
});

describe('Connexion par code e-mail (emailOTP)', () => {
  it('envoie un code et ouvre une session avec ce code', async () => {
    const u = await createVerifiedUser('otp');
    created.push(u.id);
    await auth.api.sendVerificationOTP({ body: { email: u.email, type: 'sign-in' } });
    const otp = getLastOtpForTests(u.email);
    expect(otp).toMatch(/^\d{6}$/);
    await expect(auth.api.signInEmailOTP({ body: { email: u.email, otp: otp === '123456' ? '654321' : '123456' } })).rejects.toThrow();
    // Le code reste valide après une tentative ratée (limite : 3 essais).
    const ok = await auth.api.signInEmailOTP({ body: { email: u.email, otp: otp! } });
    expect(ok.token).toBeTruthy();
    expect(ok.user.id).toBe(u.id);
  });

  it('ne crée pas de compte pour une adresse inconnue (disableSignUp)', async () => {
    const email = `nobody-${Date.now()}@test.polyweb.local`;
    await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } }).catch(() => undefined);
    const otp = getLastOtpForTests(email);
    if (otp) await expect(auth.api.signInEmailOTP({ body: { email, otp } })).rejects.toThrow();
    const rows = await getDrizzle().select().from(schema.user).where(eq(schema.user.email, email));
    expect(rows).toHaveLength(0);
  });
});

describe('Passkeys (WebAuthn)', () => {
  it('génère des options d’enregistrement liées au rpID configuré', async () => {
    const u = await createVerifiedUser('passkey');
    created.push(u.id);
    const headers = new Headers({ cookie: await signInCookie(u.email, u.password) });
    const opts = await auth.api.generatePasskeyRegistrationOptions({ headers });
    expect(opts.challenge).toBeTruthy();
    expect(opts.rp.id).toBe(new URL(process.env.BETTER_AUTH_URL || process.env.SITE_URL || 'http://localhost:4321').hostname);
    expect(opts.user.name).toBe(u.email);
  });
});
