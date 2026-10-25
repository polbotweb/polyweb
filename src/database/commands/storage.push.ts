/**
 * pnpm storage:push [--dry-run]
 *
 * Copie le contenu de public/uploads/ vers le stockage objet configuré
 * (STORAGE_DRIVER=s3|r2), en conservant les clés. Idempotent (réécrit).
 *
 * ⚠ Partiel : ne réécrit PAS les URL `/uploads/...` déjà stockées en base
 * (media_files, site_settings, contenus). Les anciennes URL restent servies
 * localement tant que public/uploads/ est conservé ; la suppression d'un
 * ancien média continue de fonctionner (deleteUpload gère les deux).
 */
import 'dotenv/config';
import { Effect } from 'effect';

import { appRuntime } from '@/lib/effect/runtime';
import { Storage } from '@/lib/storage';
import { makeLocalStorage } from '@/lib/storage/local';



const dryRun = process.argv.includes('--dry-run');
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon', gif: 'image/gif', pdf: 'application/pdf' };

const program = Effect.gen(function* () {
  const target = yield* Storage;
  if (target.driver === 'local') {
    yield* Effect.logWarning('STORAGE_DRIVER=local : rien à pousser.');
    return { copied: 0 };
  }
  const local = makeLocalStorage();
  // Fichiers cachés (.gitkeep…) ignorés : clés non valides côté stockage.
  const objects = (yield* local.list('')).filter((o) => !o.key.split('/').some((seg) => seg.startsWith('.')));
  let copied = 0;
  yield* Effect.forEach(
    objects,
    (o) =>
      Effect.gen(function* () {
        const ext = o.key.split('.').pop()?.toLowerCase() ?? '';
        if (dryRun) return yield* Effect.log(`[dry-run] ${o.key}`);
        const body = yield* local.get(o.key);
        yield* target.put(o.key, body, { contentType: MIME[ext] ?? 'application/octet-stream', cacheControl: 'public, max-age=31536000, immutable' });
        copied++;
      }),
    { concurrency: 8 },
  );
  yield* Effect.log(`${dryRun ? 'Simulation' : 'Copie'} terminée : ${dryRun ? objects.length : copied} fichier(s).`);
  return { copied };
});

appRuntime
  .runPromise(program)
  .then(() => appRuntime.dispose())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await appRuntime.dispose();
    process.exit(1);
  });
