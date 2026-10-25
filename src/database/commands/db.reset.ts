import { Effect } from 'effect';
import { getPgClient, shutdownDb } from '../drizzle';
import { dbNameFromUrl, getDbUrl } from '../env';
import { c, logTarget, confirmDestructive, resetAllTables } from './_utils';
import { runScript, sqlStep, step, withPgClient } from './_effect';

const program = Effect.gen(function* () {
  const dbName = dbNameFromUrl(getDbUrl());

  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   🗑️  Reset Database — ${dbName}`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  logTarget();
  yield* step('confirmation', () => confirmDestructive('RESET COMPLET (suppression de toutes les tables + historique migrations)'));

  yield* withPgClient(getPgClient, (client) =>
    Effect.gen(function* () {
      yield* step('suppression des tables', () => resetAllTables(client));
      // Journal de migrations : absent s'il a déjà été supprimé (pas une erreur).
      yield* sqlStep(client, 'journal des migrations', 'DELETE FROM __drizzle_migrations').pipe(
        Effect.tap(() => Effect.sync(() => console.log(c.green('  ⟳ Historique des migrations réinitialisé.')))),
        Effect.ignore,
      );
      console.log(c.green(c.bold('\n✔️  Reset complet.')));
    }),
  );
});

// Entrée Effect : étapes nommées (ScriptError), client rendu au pool, pool fermé dans tous les cas.
runScript('db:reset', program, { dispose: shutdownDb });
