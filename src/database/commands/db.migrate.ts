import path from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { getPgClient, shutdownDb } from '../drizzle';
import { getConnectionLabel, dbNameFromUrl, getDbUrl } from '../env';
import { c, logTarget, confirmProd, confirmDestructive, resetAllTables } from './_utils';
import { splitSqlStatements, DDL_ALREADY_EXISTS_CODES } from './_migration-sql';
import type { PoolClient } from 'pg';
import { Effect } from 'effect';
import { inTransaction, runScript, ScriptError, sqlStep, step, withPgClient } from './_effect';

type MigrationRecord = { id: string; sql: string };

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'src/database/migrations');

const banner = (text: string) => Effect.sync(() => {
  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   ${text}`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));
});
const footer = Effect.sync(() => console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════\n`))));

/**
 * Une instruction dans un SAVEPOINT : une erreur « existe déjà » (DDL_ALREADY_EXISTS_CODES)
 * annule encore la transaction Postgres englobante, d'où le retour au savepoint avant de continuer.
 * Toute autre erreur remonte (la transaction de la migration est alors annulée).
 */
const applyStatement = (client: PoolClient, migrationId: string, stmt: string) =>
  Effect.gen(function* () {
    yield* sqlStep(client, 'SAVEPOINT', 'SAVEPOINT migration_stmt');
    const outcome = yield* Effect.tryPromise({ try: () => client.query(stmt), catch: (error) => error }).pipe(
      Effect.as('ok' as const),
      Effect.catch((error) => {
        const pgCode = (error as { code?: string })?.code;
        if (!pgCode || !DDL_ALREADY_EXISTS_CODES.has(pgCode)) return Effect.fail(new ScriptError({ step: `migration ${migrationId}`, cause: error }));
        return Effect.as(sqlStep(client, 'ROLLBACK TO SAVEPOINT', 'ROLLBACK TO SAVEPOINT migration_stmt'), { ignored: error instanceof Error ? error.message : String(error) });
      }),
    );
    yield* sqlStep(client, 'RELEASE SAVEPOINT', 'RELEASE SAVEPOINT migration_stmt');
    if (outcome !== 'ok') console.warn(c.yellow(`  ⚠️  Ignoré : ${outcome.ignored}`));
  });

/** Une migration = une transaction (instructions + inscription dans l'historique). */
const applyMigration = (client: PoolClient, migration: MigrationRecord) =>
  Effect.gen(function* () {
    console.log(c.green(c.bold(`\n[migrate] → ${migration.id}`)));
    yield* inTransaction(client, Effect.gen(function* () {
      yield* Effect.forEach(splitSqlStatements(migration.sql), (stmt) => applyStatement(client, migration.id, stmt), { discard: true });
      yield* sqlStep(client, `historique ${migration.id}`,
        "INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES ($1, '', NOW()) ON CONFLICT (id) DO NOTHING", [migration.id]);
    })).pipe(Effect.tapError((error) => Effect.sync(() => console.error(c.red(`  ❌ Erreur : ${error.message}`)))));
  });

const program = Effect.gen(function* () {
  yield* banner(`🚀 Migration Drizzle — ${getConnectionLabel()}`);
  logTarget();
  yield* step('confirmation PROD', () => confirmProd('migration'));

  yield* withPgClient(getPgClient, (client) => Effect.gen(function* () {
    if (process.argv.includes('--reset')) {
      const dbName = dbNameFromUrl(getDbUrl());
      console.log(c.bgRed(` DESTRUCTIF: --reset — toutes les tables de ${dbName} vont être SUPPRIMÉES ! `));
      yield* step('confirmation --reset', () => confirmDestructive('--reset (suppression de toutes les tables + historique migrations)'));
      yield* step('reset des tables', () => resetAllTables(client));
    }

    yield* step('table __drizzle_migrations', () => ensureMigrationsTable(client));
    const applied = yield* step('lecture de l’historique', () => loadAppliedMigrations(client));
    const pending = yield* step('lecture des migrations', async () => collectMigrations(applied));

    if (pending.length === 0) {
      console.log(c.green(c.bold(`\n✔️  Aucune migration en attente.`)));
      if (!existsSync(MIGRATIONS_DIR)) {
        console.log(c.yellow('⚠️  Dossier de migrations introuvable.'));
        console.log(`  Générez des migrations avec : ${c.cyan('npm run db:generate')}`);
      } else if (readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).length === 0) {
        console.log(c.yellow('⚠️  Dossier de migrations vide.'));
        console.log(`  Créez des schémas puis : ${c.cyan('npm run db:generate')}`);
      } else {
        console.log(c.cyan('Toutes les migrations sont déjà appliquées.'));
      }
      return yield* footer;
    }

    yield* Effect.forEach(pending, (migration) => applyMigration(client, migration), { discard: true });
    console.log(c.green(c.bold('\n✔️  Toutes les migrations appliquées.')));
    yield* footer;
  }));
});

function collectMigrations(applied: Set<string>): MigrationRecord[] {
  if (!existsSync(MIGRATIONS_DIR)) {
    console.warn(`[migrate] Dossier introuvable: ${MIGRATIONS_DIR}`);
    return [];
  }

  return readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort()
    .map(file => ({
      id: file.replace('.sql', ''),
      sql: readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'),
    }))
    .filter(migration => !applied.has(migration.id));
}

async function ensureMigrationsTable(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id text PRIMARY KEY,
      hash text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function loadAppliedMigrations(client: PoolClient): Promise<Set<string>> {
  try {
    const result = await client.query<{ id: string }>(
      'SELECT id FROM __drizzle_migrations ORDER BY created_at ASC'
    );
    return new Set(result.rows.map(row => row.id));
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === '42P01') return new Set<string>();
    throw error;
  }
}


// Entrée Effect : erreurs typées (ScriptError), code de sortie ; client rendu et pool fermé dans tous les cas.
runScript('db:migrate', program, { dispose: shutdownDb });
