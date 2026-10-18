/**
 * pnpm db:backup [--out backups] [--media] [--keep 7]
 * Crée backups/polyweb-<horodatage>.tar.gz (pg_dump custom + manifest + médias optionnels).
 */
import 'dotenv/config';
import { Effect } from 'effect';
import { getDbUrl } from '../env';
import { logTarget } from './_utils';
import { appRuntime } from '@/lib/effect/runtime';
import { createBackup } from '@/lib/backup/backup';

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);

const program = Effect.gen(function* () {
  logTarget();
  const r = yield* createBackup({
    databaseUrl: getDbUrl(),
    outDir: arg('--out') ?? process.env.BACKUP_DIR ?? 'backups',
    includeMedia: process.argv.includes('--media'),
    keep: Number(arg('--keep') ?? process.env.BACKUP_KEEP ?? 0) || 0,
    release: process.env.POLYWEB_RELEASE ?? process.env.npm_package_version ?? null,
  });
  yield* Effect.log(
    `[db:backup] ${r.archive} — base ${(r.manifest.database.bytes / 1024).toFixed(0)} Kio, ${r.manifest.database.migrations.length} migrations, médias ${r.manifest.media.count}${r.removed.length ? `, ${r.removed.length} ancienne(s) supprimée(s)` : ''}`,
  );
});

appRuntime
  .runPromise(program)
  .then(() => appRuntime.dispose())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('[db:backup] échec :', e instanceof Error ? e.message : e);
    await appRuntime.dispose();
    process.exit(1);
  });
