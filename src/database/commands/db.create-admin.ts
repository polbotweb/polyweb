/**
 * admin:create — crée (ou met à jour) un compte administrateur.
 * Repris de les-rochers-blancs scripts/create-admin.ts, adapté à pg + getDbUrl()
 * et au schéma polyweb. Aucun mot de passe par défaut n'est codé en dur.
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… pnpm admin:create [--name="Jane"]
 *   ADMIN_PASSWORD_FILE=/run/secrets/admin_pw pnpm admin:create
 *
 * Si l'utilisateur existe : mot de passe réinitialisé et rôle forcé à "admin".
 */
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'astro/zod';
import { auth } from '@/lib/auth';
import { getDrizzle, shutdownDb, schema } from '../drizzle';
import { c, logTarget, confirmProd } from './_utils';
import { Effect } from 'effect';
import { runScript, ScriptError, step } from './_effect';

const MIN = 12;
/** Better Auth 1.7 : issuer des comptes credential (createLocalAccountIssuer('credential')). */
const CREDENTIAL_ISSUER = 'local:credential';
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

export const adminEmailSchema = z.string().trim().toLowerCase().pipe(z.email({ message: 'ADMIN_EMAIL doit être un email valide' }));
export const adminPasswordSchema = z
  .string()
  .min(MIN, `ADMIN_PASSWORD doit contenir au moins ${MIN} caractères`)
  .max(128, 'ADMIN_PASSWORD doit contenir au plus 128 caractères');

async function resolvePassword(): Promise<string | undefined> {
  if (process.env.ADMIN_PASSWORD_FILE) return (await readFile(process.env.ADMIN_PASSWORD_FILE, 'utf8')).trim();
  return process.env.ADMIN_PASSWORD;
}

/** Validation zod → ScriptError (message de la première erreur). */
const parseOrFail = <T>(label: string, schema: z.ZodType<T>, value: unknown) =>
  Effect.suspend(() => {
    const r = schema.safeParse(value);
    return r.success ? Effect.succeed(r.data) : Effect.fail(new ScriptError({ step: label, cause: r.error.issues[0]?.message ?? `${label} invalide` }));
  });

/** Compte existant : rôle admin forcé, mot de passe réinitialisé (compte credential créé s'il manque). */
const updateExisting = (existing: { id: string }, email: string, hashed: string) =>
  step('mise à jour de l’administrateur', async () => {
    const db = getDrizzle();
    await db.update(schema.user).set({ role: 'admin', emailVerified: true, updatedAt: new Date() }).where(eq(schema.user.id, existing.id));
    const updated = await db.update(schema.account).set({ password: hashed, issuer: CREDENTIAL_ISSUER, accountId: existing.id, updatedAt: new Date() })
      .where(and(eq(schema.account.userId, existing.id), eq(schema.account.providerId, 'credential'))).returning({ id: schema.account.id });
    if (updated.length === 0) {
      await db.insert(schema.account).values({ id: randomUUID(), accountId: existing.id, issuer: CREDENTIAL_ISSUER, providerId: 'credential', userId: existing.id, password: hashed, createdAt: new Date(), updatedAt: new Date() });
    }
    console.log(c.green(`✅ Administrateur existant mis à jour : ${email} (rôle admin, mot de passe réinitialisé)`));
  });

const createAdmin = (email: string, name: string, hashed: string) =>
  step('création de l’administrateur', async () => {
    const id = randomUUID();
    const now = new Date();
    await getDrizzle().transaction(async (tx) => {
      await tx.insert(schema.user).values({ id, name, email, emailVerified: true, role: 'admin', createdAt: now, updatedAt: now });
      await tx.insert(schema.account).values({ id: randomUUID(), accountId: id, issuer: CREDENTIAL_ISSUER, providerId: 'credential', userId: id, password: hashed, createdAt: now, updatedAt: now });
    });
    console.log(c.green(`✅ Administrateur créé : ${email}`));
  });

const program = Effect.gen(function* () {
  logTarget();
  const email = yield* parseOrFail('ADMIN_EMAIL', adminEmailSchema, arg('email') ?? process.env.ADMIN_EMAIL ?? '');
  const pw = yield* step('lecture du mot de passe', resolvePassword);
  if (!pw) return yield* Effect.fail(new ScriptError({ step: 'ADMIN_PASSWORD', cause: 'ADMIN_PASSWORD (ou ADMIN_PASSWORD_FILE) est requis' }));
  const password = yield* parseOrFail('ADMIN_PASSWORD', adminPasswordSchema, pw);
  yield* step('confirmation PROD', () => confirmProd('création administrateur'));

  const name = arg('name') ?? process.env.ADMIN_NAME ?? 'Administrateur';
  // Utilise le hasher configuré dans l'instance Better Auth (même format que sign-up).
  const hashed = yield* step('hachage du mot de passe', async () => (await auth.$context).password.hash(password));
  const [existing] = yield* step('recherche du compte', () => getDrizzle().select().from(schema.user).where(eq(schema.user.email, email)));
  yield* existing ? updateExisting(existing, email, hashed) : createAdmin(email, name, hashed);
});

// Entrée Effect : erreurs typées (ScriptError), code de sortie ; pool fermé dans tous les cas.
runScript('admin:create', program, { dispose: shutdownDb });
