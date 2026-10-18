/**
 * db:baseline — marque toutes les migrations versionnées comme appliquées sur une
 * base existante créée hors migrations (ex. `drizzle-kit push`), sans exécuter de SQL.
 * Repris de les-rochers-blancs scripts/db-baseline.ts, adapté au migrateur polyweb
 * (table __drizzle_migrations, fichiers src/database/migrations/*.sql).
 *
 * Sans effet si l'historique est déjà rempli ou si la base est vide
 * (dans ce cas db:migrate appliquera tout normalement).
 */
import path from 'path';
import { readdirSync } from 'fs';
import { getPgClient, shutdownDb } from '../drizzle';
import { c, logTarget, confirmProd } from './_utils';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'src/database/migrations');

async function main() {
  logTarget();
  await confirmProd('baseline des migrations');
  const client = await getPgClient();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (id text PRIMARY KEY, hash text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT NOW())`);
    const { rows: [log] } = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM __drizzle_migrations');
    if ((log?.count ?? 0) > 0) { console.log(c.green('Historique de migrations déjà rempli — aucun baseline nécessaire.')); return; }
    const { rows: [tables] } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '__drizzle_migrations'`,
    );
    if ((tables?.count ?? 0) === 0) { console.log(c.cyan('Base vide — baseline ignoré, lancez db:migrate.')); return; }
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    await client.query('BEGIN');
    for (const f of files) {
      await client.query("INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES ($1, '', NOW()) ON CONFLICT (id) DO NOTHING", [f.replace(/\.sql$/, '')]);
    }
    await client.query('COMMIT');
    console.log(c.green(`Baseline : ${files.length} migration(s) marquée(s) comme appliquée(s).`));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
    await shutdownDb();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
