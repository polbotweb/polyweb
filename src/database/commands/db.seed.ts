import path from 'path';
import { pathToFileURL } from 'url';
import { getPgClient, getDrizzle, shutdownDb } from '../drizzle';
import * as allSchemas from '../schemas';
import { seedManifest } from '../data/manifest';
import { c, logTarget, confirmProd, confirmDestructive, truncateAllTables } from './_utils';
import { Effect } from 'effect';
import { runScript, step, withPgClient } from './_effect';

type SeedTx = { insert(t: unknown): { values(r: unknown[]): { onConflictDoNothing(): Promise<void> } & Promise<void> } };
const DATA_DIR = path.resolve(process.cwd(), 'src/database/data');

/** Une entrée du manifest (dans la transaction Drizzle du seed) ; un échec annule tout le seed. */
async function seedEntry(tx: SeedTx, entry: (typeof seedManifest)[number]): Promise<void> {
  const schemaTable = (allSchemas as Record<string, unknown>)[entry.schemaExport];
  if (!schemaTable) {
    console.warn(c.yellow(`[SKIP] Export "${entry.schemaExport}" introuvable dans schemas.ts — vérifiez le manifest.`));
    return;
  }
  try {
    if (!/^\d+[a-z]?-[a-z][a-z0-9-]*\.data\.ts$/.test(entry.dataFile)) {
      throw new Error(`Nom de fichier de données invalide : "${entry.dataFile}". Attendu : NNN-nom.data.ts ou NNNx-nom.data.ts`);
    }
    const dataModule = await import(pathToFileURL(path.join(DATA_DIR, entry.dataFile)).href);
    const dataset = Object.values(dataModule).find((d: unknown) => Array.isArray(d)) as Record<string, unknown>[] | undefined;
    if (!dataset || dataset.length === 0) {
      console.log(c.yellow(`[SKIP] Dataset vide ou introuvable : ${entry.dataFile}`));
      return;
    }
    const rows = dataset.map(normalizeRow);
    const inserter = tx.insert(schemaTable).values(rows);
    if (typeof inserter.onConflictDoNothing === 'function') await inserter.onConflictDoNothing();
    else await inserter;
    console.log(c.green(`[OK] ${entry.label} → ${entry.schemaExport} (${rows.length} lignes)`));
  } catch (err: unknown) {
    console.error(c.red(`[ERR] ${entry.label}: ${err instanceof Error ? err.message : String(err)}`));
    throw err; // abort transaction
  }
}

const program = Effect.gen(function* () {
  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   🌱 Seed Database`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  logTarget();
  yield* step('confirmation PROD', () => confirmProd('seed'));

  if (seedManifest.length === 0) {
    console.log(c.yellow('[INFO] Le manifest est vide — aucune donnée à insérer.'));
    console.log(`  Ajoutez des entrées dans ${c.cyan('src/database/data/manifest.ts')}`);
    return;
  }

  // --- --reset flag : vide les tables avant seed ──────────────────
  if (process.argv.includes('--reset')) {
    console.log(c.bgRed(' RESET: Toutes les tables vont être vidées avant le seed ! '));
    yield* step('confirmation --reset', () => confirmDestructive('--reset (vidage de toutes les tables avant seed)'));
    yield* withPgClient(getPgClient, (client) => step('vidage des tables', () => truncateAllTables(client)));
  }

  // --- Seed chaque entrée du manifest dans l'ordre (une seule transaction) ─
  yield* step('seed (transaction)', () => getDrizzle().transaction(async (tx) => {
    for (const entry of seedManifest) await seedEntry(tx as unknown as SeedTx, entry);
  })).pipe(
    Effect.tapError((error) => Effect.sync(() => {
      console.error(c.red(c.bold('\n❌ Seed annulé — toutes les modifications ont été annulées (ROLLBACK).')));
      console.error(error.cause instanceof Error ? error.cause.stack ?? error.cause.message : String(error.cause));
    })),
  );

  console.log(c.green(c.bold('\n✔️  Seed terminé.')));
});

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (Array.isArray(v)) out[k] = JSON.stringify(v);
    else out[k] = v;
  }
  return out;
}


// Entrée Effect : erreurs typées (ScriptError), code de sortie ; pool fermé dans tous les cas.
runScript('db:seed', program, { dispose: shutdownDb });
