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
import { runScript, step } from './_effect';
import { inspectBackup, restoreBackup } from '@/lib/backup/backup';
import { knownMigrations } from '@/lib/backup/migrations';

const archive = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!archive) {
  console.error('Usage : pnpm db:restore <archive.tar.gz> [--media] [--yes] [--verify-only]');
  process.exit(2);
}

const program = Effect.gen(function* () {
  logTarget();
  const checked = yield* inspectBackup(archive!);
  yield* Effect.promise(() => rm(checked.work, { recursive: true, force: true }));
  const m = checked.manifest;
  console.log(`Archive valide : ${m.createdAt}, ${m.database.migrations.length} migrations, médias ${m.media.count}.`);
  if (process.argv.includes('--verify-only')) return;
  if (isProd()) yield* step('confirmation', () => confirmProd('la restauration (écrasement complet de la base)'));
  else if (!process.argv.includes('--yes')) yield* step('confirmation', () => confirmDestructive('La base cible va être ENTIÈREMENT remplacée'));
  const r = yield* restoreBackup({ archive: archive!, databaseUrl: getDbUrl(), restoreMedia: process.argv.includes('--media'), knownMigrations: knownMigrations() });
  console.log(`[db:restore] terminé. Médias restaurés : ${r.mediaRestored}. Lancez « pnpm db:migrate » si le code est plus récent que la sauvegarde.`);
});

runScript('db:restore', step('restauration', () => appRuntime.runPromise(program)), { dispose: () => appRuntime.dispose() });
