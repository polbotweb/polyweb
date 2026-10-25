import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { getDrizzle, schema } from '@database/drizzle';
import { signInCookie, waitForAuditEvents } from '../helpers/auth-users';

const email = `cli-admin-${Date.now()}@test.polyweb.local`;
const run = (password: string) =>
  execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/database/commands/db.create-admin.ts', '--name=CLI Admin'], {
    env: { ...process.env, ADMIN_EMAIL: email, ADMIN_PASSWORD: password },
    encoding: 'utf8',
  });

describe('admin:create (repris de les-rochers-blancs)', () => {
  afterAll(async () => {
    const [u] = await getDrizzle().select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email));
    // 2 connexions réussies (une par test) : leur audit, écrit en arrière-plan, doit être en base avant la suppression.
    if (u) await waitForAuditEvents(u.id, 'SIGN_IN', 2);
    await getDrizzle().delete(schema.user).where(eq(schema.user.email, email));
  });

  it('crée un admin vérifié dont le mot de passe fonctionne avec Better Auth', async () => {
    run('FirstPassw0rd-123');
    const [u] = await getDrizzle().select().from(schema.user).where(eq(schema.user.email, email));
    expect(u?.role).toBe('admin');
    expect(u?.emailVerified).toBe(true);
    expect(await signInCookie(email, 'FirstPassw0rd-123')).toContain('session_token');
  }, 60_000);

  it('réinitialise le mot de passe si le compte existe déjà', async () => {
    run('SecondPassw0rd-456');
    await expect(signInCookie(email, 'FirstPassw0rd-123')).rejects.toThrow();
    expect(await signInCookie(email, 'SecondPassw0rd-456')).toContain('session_token');
  }, 60_000);
});
