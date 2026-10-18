/**
 * pnpm db:restore <archive.tar.gz> [--media] [--yes] [--verify-only]
 * Vérifie l'archive (manifest, sha256, compatibilité des migrations) puis
 * REMPLACE le schéma public de la base cible. Demande confirmation (sauf --yes ;
 * en production CONFIRM_PROD=oui reste exigé).
 */
import 'dotenv/config';
import { rm } from 'node:fs/promises';
import { Effect } from 'effect';
import { getDbUrl, isProd } from '../env';
import { confirmDestructive, confirmProd, logTarget } from './_utils';
import { appRuntime } from '@/lib/effect/runtime';
import { inspectBackup, restoreBackup } from '@/lib/backup/backup';
import { knownMigrations } from '@/lib/backup/migrations';

const archive = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!archive) {
  console.error('Usage : pnpm db:restore <archive.tar.gz> [--media] [--yes] [--verify-only]');
  process.exit(2);
}

async function main() {
  logTarget();
  const checked = await appRuntime.runPromise(inspectBackup(archive!));
  await rm(checked.work, { recursive: true, force: true });
  const m = checked.manifest;
  console.log(`Archive valide : ${m.createdAt}, ${m.database.migrations.length} migrations, médias ${m.media.count}.`);
  if (process.argv.includes('--verify-only')) return;
  if (isProd()) await confirmProd('la restauration (écrasement complet de la base)');
  else if (!process.argv.includes('--yes')) await confirmDestructive('La base cible va être ENTIÈREMENT remplacée');
  const r = await appRuntime.runPromise(
    restoreBackup({ archive: archive!, databaseUrl: getDbUrl(), restoreMedia: process.argv.includes('--media'), knownMigrations: knownMigrations() }),
  );
  console.log(`[db:restore] terminé. Médias restaurés : ${r.mediaRestored}. Lancez « pnpm db:migrate » si le code est plus récent que la sauvegarde.`);
}

main()
  .then(() => appRuntime.dispose())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('[db:restore] échec :', e instanceof Error ? e.message : e);
    await appRuntime.dispose();
    process.exit(1);
  });
