/**
 * db.clean-media — Vide les tables media_files et media_folders.
 * Run: pnpm db:clean-media
 */
import { getDrizzle, shutdownDb } from '../drizzle';
import { mediaFiles, mediaFolders } from '../schemas';
import { c, logTarget, confirmProd } from './_utils';
import { runScript, step } from './_effect';

async function cleanMedia() {
  console.log(c.cyan(c.bold(`\n  🗑️  Clean Media — Suppression des entrées media\n`)));
  logTarget();
  await confirmProd('clean-media');

  const db = getDrizzle();
  await db.delete(mediaFiles);
  await db.delete(mediaFolders);
  console.log(c.green('  ✔ Tables media_files + media_folders vidées.\n'));
  await shutdownDb();
}


// Entrée Effect : erreurs typées (ScriptError), code de sortie et journalisation communs.
runScript('db:clean-media', step('db:clean-media', cleanMedia));
