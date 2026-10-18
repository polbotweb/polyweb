import { Client } from 'pg';
import { isProd, getDbUrl, getConnectionLabel, maskUrl, dbNameFromUrl } from '../env';

// ─── ANSI Colors ─────────────────────────────────────────────────────
export const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  bgRed: (s: string) => `\x1b[41m\x1b[97m${s}\x1b[0m`,
} as const;

// ─── Log target DB info ──────────────────────────────────────────────
export function logTarget(): void {
  const url = getDbUrl();
  const label = getConnectionLabel();
  console.log(`${c.cyan(`Cible DB:`)} ${maskUrl(url)} (${label})`);
  if (isProd()) {
    console.log(c.bgRed(` PROD ATTENTION !! Vous ciblez la base de production : ${dbNameFromUrl(url)} `));
  }
}

// ─── Unified PROD confirmation ───────────────────────────────────────
export async function confirmProd(action: string): Promise<void> {
  if (!isProd()) return;

  if (process.env.CONFIRM_PROD === 'oui') {
    console.log(c.yellow(`[SECURE] CONFIRM_PROD=oui — ${action} sur PROD autorisé.`));
    return;
  }

  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(c.yellow(`Confirmez ${action} sur PROD (oui/non): `));
  rl.close();

  if (answer.trim().toLowerCase() !== 'oui') {
    console.log('Opération annulée.');
    process.exit(0);
  }
}

// ─── Confirm destructive operation (even in local) ───────────────────
export async function confirmDestructive(action: string): Promise<void> {
  if (isProd()) {
    await confirmProd(action);
    return;
  }

  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(c.yellow(`${action} — Confirmer ? (oui/non): `));
  rl.close();

  if (answer.trim().toLowerCase() !== 'oui') {
    console.log('Opération annulée.');
    process.exit(0);
  }
}

// ─── Shared reset logic (drop all tables + reset migration journal) ──
export async function resetAllTables(client: import('pg').PoolClient): Promise<void> {
  console.log(c.yellow('Suppression des tables en cours...'));
  await client.query('SET session_replication_role = replica;');
  const { rows: tables } = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  for (const { tablename } of tables) {
    try {
      await client.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE;`);
      console.log(c.green(`  ✗ ${tablename}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(c.yellow(`  ⚠ Échec suppression ${tablename}: ${msg}`));
    }
  }
  await client.query('SET session_replication_role = DEFAULT;');
  console.log(c.green('Toutes les tables supprimées.'));
}

export async function truncateAllTables(client: import('pg').PoolClient): Promise<void> {
  console.log(c.yellow('Vidage des tables en cours...'));
  await client.query('SET session_replication_role = replica;');
  const { rows: tables } = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  for (const { tablename } of tables) {
    try {
      await client.query(`TRUNCATE TABLE "${tablename}" RESTART IDENTITY CASCADE;`);
      console.log(c.green(`  ⟳ ${tablename}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(c.yellow(`  ⚠ Échec vidage ${tablename}: ${msg}`));
    }
  }
  await client.query('SET session_replication_role = DEFAULT;');
  console.log(c.green('Toutes les tables vidées.'));
}

// ─── Format PG errors into friendly messages ─────────────────────────
interface PgError { code?: string; message?: string }

export function formatPgError(err: unknown): string {
  const e = err as PgError;
  const code = e?.code;
  if (code === '28P01') return 'Utilisateur ou mot de passe incorrect';
  if (code === '3D000') return `La base n'existe pas`;
  if (code === '28000') return 'Authentification refusée (vérifiez pg_hba.conf)';
  if (code === '57P03') return 'Le serveur PostgreSQL démarre encore — réessayez dans quelques secondes';
  if (code === 'ECONNREFUSED') return 'Connexion refusée — le serveur PostgreSQL est-il démarré ?';
  if (code === 'ENOTFOUND') return 'Hôte introuvable — vérifiez l\'adresse du serveur dans .env';
  if (code === 'ETIMEDOUT') return 'Timeout de connexion — le serveur est-il accessible ?';
  if (code === 'ECONNRESET') return 'Connexion réinitialisée par le serveur';
  if (e?.message) return e.message;
  return String(err);
}

// ─── Safe connect with friendly error ────────────────────────────────
export async function safeConnect(label: string, url: string): Promise<{ client: Client; ok: true } | { client: null; ok: false }> {
  const client = new Client({
    connectionString: url,
    ssl: url.includes('sslmode=require')
      ? { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT || undefined }
      : undefined,
  });
  try {
    await client.connect();
    const res = await client.query('SELECT current_database() as db, current_user as "user"');
    const info = res.rows[0];
    console.log(c.green(`✔ [${label}] Connecté à ${info.db} (user: ${info.user})`));
    return { client, ok: true };
  } catch (err) {
    console.error(c.red(`✖ [${label}] ${formatPgError(err)}`));
    console.error(c.yellow(`   URL : ${maskUrl(url)}`));
    const code = (err as PgError)?.code;
    if (code === '28P01') console.error(c.dim('   → Vérifiez user/password dans .env'));
    if (code === '3D000') console.error(c.dim('   → Créez la base avec : createdb <nom_base>'));
    if (code === 'ECONNREFUSED') console.error(c.dim('   → Lancez PostgreSQL ou vérifiez le port'));
    return { client: null, ok: false };
  }
}
