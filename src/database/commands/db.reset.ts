import { getPgClient, shutdownDb } from '../drizzle';
import { dbNameFromUrl, getDbUrl } from '../env';
import { c, logTarget, confirmDestructive, resetAllTables } from './_utils';
import { runScript, step } from './_effect';

const main = async () => {
  const dbName = dbNameFromUrl(getDbUrl());

  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   🗑️  Reset Database — ${dbName}`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  logTarget();
  await confirmDestructive('RESET COMPLET (suppression de toutes les tables + historique migrations)');

  const client = await getPgClient();
  try {
    await resetAllTables(client);

    // Reset migration journal if it still exists
    try {
      await client.query('DELETE FROM __drizzle_migrations');
      console.log(c.green('  ⟳ Historique des migrations réinitialisé.'));
    } catch {
      // Table doesn't exist (already dropped) — that's fine
    }

    console.log(c.green(c.bold('\n✔️  Reset complet.')));
  } finally {
    client.release();
    await shutdownDb();
  }
};

// Entrée Effect : erreurs typées (ScriptError), code de sortie et journalisation communs.
runScript('db:reset', step('db:reset', main));
