/**
 * Rotate old log files in the logs/ directory.
 * Deletes dead-letter and audit-fallback JSONL files older than LOGS_RETENTION_DAYS (default 30).
 *
 * Usage: npx tsx src/smtp/commands/logs.rotate.ts
 */
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { runScript, step } from '../../database/commands/_effect';

const DEFAULT_RETENTION_DAYS = 30;

async function main() {
  const retentionDays = Math.max(
    1,
    parseInt(process.env.LOGS_RETENTION_DAYS ?? String(DEFAULT_RETENTION_DAYS), 10) || DEFAULT_RETENTION_DAYS,
  );
  const logsDir = join(process.cwd(), 'logs');
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  console.log(`\n🗂️  Log rotation — suppression des fichiers > ${retentionDays} jours dans logs/\n`);

  let files: string[];
  try {
    files = await readdir(logsDir);
  } catch {
    console.log('  Aucun dossier logs/ trouvé — rien à nettoyer.');
    return;
  }

  const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
  let deleted = 0;

  for (const file of jsonlFiles) {
    const filePath = join(logsDir, file);
    try {
      const info = await stat(filePath);
      if (info.mtimeMs < cutoff) {
        await unlink(filePath);
        console.log(`  ✔ Supprimé : ${file}`);
        deleted++;
      }
    } catch (err) {
      console.error(`  ✘ Erreur pour ${file}:`, err);
    }
  }

  console.log(`\n✅ ${deleted} fichier(s) supprimé(s) sur ${jsonlFiles.length} fichier(s) JSONL.\n`);
}


// Entrée Effect : erreurs typées (ScriptError), code de sortie et journalisation communs.
runScript('logs:rotate', step('logs:rotate', main));
