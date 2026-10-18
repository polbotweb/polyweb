/**
 * db.clean-media — Vide les tables media_files et media_folders.
 * Run: pnpm db:clean-media
 */
import { Effect } from 'effect';
import { getDrizzle, shutdownDb } from '../drizzle';
import { mediaFiles, mediaFolders } from '../schemas';
import { c, logTarget, confirmProd } from './_utils';
import { runScript, step } from './_effect';

const program = Effect.gen(function* () {
  console.log(c.cyan(c.bold(`\n  🗑️  Clean Media — Suppression des entrées media\n`)));
  logTarget();
  yield* step('confirmation', () => confirmProd('clean-media'));
  const db = getDrizzle();
  yield* step('suppression media_files', () => db.delete(mediaFiles));
  yield* step('suppression media_folders', () => db.delete(mediaFolders));
  console.log(c.green('  ✔ Tables media_files + media_folders vidées.\n'));
});

// Entrée Effect : étapes nommées (ScriptError), code de sortie ; pool fermé dans tous les cas.
runScript('db:clean-media', program, { dispose: shutdownDb });
