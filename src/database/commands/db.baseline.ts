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
import { Effect } from 'effect';
import { getPgClient, shutdownDb } from '../drizzle';
import { c, logTarget, confirmProd } from './_utils';
import { inTransaction, runScript, sqlStep, step, withPgClient } from './_effect';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'src/database/migrations');

const program = Effect.gen(function* () {
  logTarget();
  yield* step('confirmation', () => confirmProd('baseline des migrations'));
  yield* withPgClient(getPgClient, (client) =>
    Effect.gen(function* () {
      yield* sqlStep(client, 'table __drizzle_migrations', `CREATE TABLE IF NOT EXISTS __drizzle_migrations (id text PRIMARY KEY, hash text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT NOW())`);
      const { rows: [log] } = yield* sqlStep<{ count: number }>(client, 'historique', 'SELECT count(*)::int AS count FROM __drizzle_migrations');
      if ((log?.count ?? 0) > 0) { console.log(c.green('Historique de migrations déjà rempli — aucun baseline nécessaire.')); return; }
      const { rows: [tables] } = yield* sqlStep<{ count: number }>(
        client,
        'tables existantes',
        `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '__drizzle_migrations'`,
      );
      if ((tables?.count ?? 0) === 0) { console.log(c.cyan('Base vide — baseline ignoré, lancez db:migrate.')); return; }
      const files = yield* step('lecture des migrations', async () => readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort());
      yield* inTransaction(
        client,
        Effect.forEach(files, (f) =>
          sqlStep(client, `baseline ${f}`, "INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES ($1, '', NOW()) ON CONFLICT (id) DO NOTHING", [f.replace(/\.sql$/, '')]),
          { discard: true },
        ),
      );
      console.log(c.green(`Baseline : ${files.length} migration(s) marquée(s) comme appliquée(s).`));
    }),
  );
});

// Entrée Effect : étapes nommées (ScriptError), transaction annulée en cas d'échec,
// client rendu au pool, pool fermé dans tous les cas.
runScript('db:baseline', program, { dispose: shutdownDb });
