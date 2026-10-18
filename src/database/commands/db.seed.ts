import path from 'path';
import { pathToFileURL } from 'url';
import { getPgClient, getDrizzle, shutdownDb } from '../drizzle';
import * as allSchemas from '../schemas';
import { seedManifest } from '../data/manifest';
import { c, logTarget, confirmProd, confirmDestructive, truncateAllTables } from './_utils';

async function seed() {
  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   🌱 Seed Database`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  logTarget();
  await confirmProd('seed');

  if (seedManifest.length === 0) {
    console.log(c.yellow('[INFO] Le manifest est vide — aucune donnée à insérer.'));
    console.log(`  Ajoutez des entrées dans ${c.cyan('src/database/data/manifest.ts')}`);
    process.exit(0);
  }

  const client = await getPgClient();
  const db = getDrizzle();

  try {
    // --- --reset flag : vide les tables avant seed ──────────────────
    if (process.argv.includes('--reset')) {
      console.log(c.bgRed(' RESET: Toutes les tables vont être vidées avant le seed ! '));
      await confirmDestructive('--reset (vidage de toutes les tables avant seed)');
      await truncateAllTables(client);
    }

    // --- Seed chaque entrée du manifest dans l'ordre (transactional) ─
    const dataDir = path.resolve(process.cwd(), 'src/database/data');

    try {
      await db.transaction(async (tx) => {
        for (const entry of seedManifest) {
          const schemaTable = (allSchemas as Record<string, unknown>)[entry.schemaExport];
          if (!schemaTable) {
            console.warn(c.yellow(`[SKIP] Export "${entry.schemaExport}" introuvable dans schemas.ts — vérifiez le manifest.`));
            continue;
          }

          try {
            if (!/^\d+[a-z]?-[a-z][a-z0-9-]*\.data\.ts$/.test(entry.dataFile)) {
              throw new Error(`Nom de fichier de données invalide : "${entry.dataFile}". Attendu : NNN-nom.data.ts ou NNNx-nom.data.ts`);
            }
            const dataURL = pathToFileURL(path.join(dataDir, entry.dataFile)).href;
            const dataModule = await import(dataURL);
            const dataset = Object.values(dataModule).find((d: unknown) => Array.isArray(d)) as Record<string, unknown>[] | undefined;

            if (!dataset || dataset.length === 0) {
              console.log(c.yellow(`[SKIP] Dataset vide ou introuvable : ${entry.dataFile}`));
              continue;
            }

            const rows = dataset.map(normalizeRow);
            const inserter = (tx as unknown as { insert(t: unknown): { values(r: unknown[]): { onConflictDoNothing(): Promise<void> } & Promise<void> } }).insert(schemaTable).values(rows);
            if (typeof inserter.onConflictDoNothing === 'function') {
              await inserter.onConflictDoNothing();
            } else {
              await inserter;
            }
            console.log(c.green(`[OK] ${entry.label} → ${entry.schemaExport} (${rows.length} lignes)`));
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(c.red(`[ERR] ${entry.label}: ${msg}`));
            throw err; // abort transaction
          }
        }
      });
    } catch (err) {
      console.error(c.red(c.bold('\n❌ Seed annulé — toutes les modifications ont été annulées (ROLLBACK).')));
      console.error(err instanceof Error ? err.stack ?? err.message : String(err));
      process.exit(1);
    }

    console.log(c.green(c.bold('\n✔️  Seed terminé.')));
  } finally {
    client.release();
    await shutdownDb();
  }
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (Array.isArray(v)) out[k] = JSON.stringify(v);
    else out[k] = v;
  }
  return out;
}

seed().catch(e => {
  console.error(c.red('[seed] Échec:'), e);
  process.exit(1);
});