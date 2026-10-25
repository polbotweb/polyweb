/**
 * db.seed-media — Scan public/uploads/ and index all existing files
 * into media_folders + media_files tables.
 *
 * Run: pnpm db:seed-media
 *
 * Safe to run multiple times — skips files already in DB (by url).
 */
import { readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { getDrizzle, shutdownDb } from '../drizzle';
import { mediaFolders, mediaFiles } from '../schemas';
import { eq } from 'drizzle-orm';
import { c, logTarget, confirmProd } from './_utils';
import { Effect } from 'effect';
import { runScript, step } from './_effect';

// ─── MIME detection from extension ───────────────────────────────────
const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function mimeFromExt(filename: string): string | null {
  const ext = extname(filename).toLowerCase();
  return EXT_TO_MIME[ext] ?? null;
}

// ─── Recursive scan ──────────────────────────────────────────────────
interface ScanResult {
  relativePath: string; // e.g. "images/site/photo.jpg"
  filename: string;
  size: number;
  mimeType: string;
  subfolder: string | null; // e.g. "images/site" or null if root
}

function scanUploads(baseDir: string, currentDir: string = baseDir): ScanResult[] {
  const results: ScanResult[] = [];
  let entries: string[];
  try {
    entries = readdirSync(currentDir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(currentDir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...scanUploads(baseDir, fullPath));
    } else if (stat.isFile()) {
      if (entry === '.gitkeep') continue;

      const mime = mimeFromExt(entry);
      if (!mime) continue; // Skip non-image files (e.g. .webp companions handled separately)

      // Skip .webp companion files (they are auto-generated)
      if (extname(entry).toLowerCase() === '.webp') {
        const baseName = entry.replace(/\.webp$/, '');
        // Check if a source file (jpg/png) exists alongside
        const hasSource = entries.some(e =>
          e !== entry && e.startsWith(baseName) && ['.jpg', '.jpeg', '.png'].includes(extname(e).toLowerCase())
        );
        if (hasSource) continue;
      }

      const relPath = relative(baseDir, fullPath).replace(/\\/g, '/');
      const relDir = relative(baseDir, currentDir).replace(/\\/g, '/');

      results.push({
        relativePath: relPath,
        filename: entry,
        size: stat.size,
        mimeType: mime,
        subfolder: relDir || null,
      });
    }
  }

  return results;
}

// ─── Main ────────────────────────────────────────────────────────────

/**
 * Mapping: disk subfolder path → logical folder name
 * - images/avatars → Avatars
 * - images/logos, images/brand → Brand
 * - everything else (images/site, images/test, media, ...) → Médias
 */
function resolveFolder(subfolder: string | null): string {
  if (!subfolder) return 'Médias';
  if (subfolder === 'images/avatars') return 'Avatars';
  if (subfolder === 'images/logos' || subfolder === 'images/brand') return 'Brand';
  return 'Médias';
}

const FOLDER_NAMES = ['Avatars', 'Brand', 'Médias'] as const;
const RASTER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
type Scanned = ReturnType<typeof scanUploads>[number];

/** Dossier logique existant ou créé → [id, créé ?]. */
const ensureFolder = (name: string) =>
  step(`dossier ${name}`, async () => {
    const db = getDrizzle();
    const [existing] = await db.select({ id: mediaFolders.id }).from(mediaFolders).where(eq(mediaFolders.name, name)).limit(1);
    if (existing) {
      console.log(`  ${c.dim('↩')} Dossier existant: ${name}`);
      return [existing.id, false] as const;
    }
    const [created] = await db.insert(mediaFolders).values({ name }).returning({ id: mediaFolders.id });
    console.log(`  ${c.green('✔')} Dossier créé: ${name}`);
    return [created.id, true] as const;
  });

/** Dimensions via sharp (non bloquant : null si illisible ou non raster). */
const readDimensions = (fullPath: string, mimeType: string) =>
  RASTER_TYPES.has(mimeType)
    ? Effect.tryPromise(async () => {
        const sharp = (await import('sharp')).default;
        const metadata = await sharp(fullPath).metadata();
        return { width: metadata.width ?? null, height: metadata.height ?? null };
      }).pipe(Effect.orElseSucceed(() => ({ width: null, height: null })))
    : Effect.succeed({ width: null as number | null, height: null as number | null });

/** Un fichier : ignoré s'il est déjà indexé, sinon inséré. Retourne true si créé. */
const indexFile = (uploadsDir: string, folderMap: Map<string, string>, file: Scanned) =>
  Effect.gen(function* () {
    const url = `/uploads/${file.relativePath}`;
    const [existing] = yield* step(`recherche ${url}`, () =>
      getDrizzle().select({ id: mediaFiles.id }).from(mediaFiles).where(eq(mediaFiles.url, url)).limit(1));
    if (existing) return false;

    const { width, height } = yield* readDimensions(join(uploadsDir, file.relativePath), file.mimeType);
    yield* step(`indexation ${url}`, () => getDrizzle().insert(mediaFiles).values({
      folderId: folderMap.get(resolveFolder(file.subfolder)) ?? null,
      filename: file.filename, url, mimeType: file.mimeType, size: file.size, width, height,
    }));
    const dims = width && height ? ` (${width}×${height})` : '';
    console.log(`  ${c.green('✔')} ${file.relativePath}${dims}`);
    return true;
  });

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;

const program = Effect.gen(function* () {
  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   📸 Seed Media — Indexation des fichiers existants`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  logTarget();
  yield* step('confirmation PROD', () => confirmProd('seed-media'));

  const uploadsDir = join(process.cwd(), 'public', 'uploads');
  const scanned = yield* step('scan public/uploads', async () => scanUploads(uploadsDir));
  console.log(`\n${c.cyan(`[scan]`)} ${scanned.length} fichiers trouvés dans public/uploads/\n`);
  if (scanned.length === 0) {
    console.log(c.yellow('Aucun fichier à indexer.'));
    return;
  }

  // 1. Les 3 dossiers logiques : Avatars, Brand, Médias
  const folders = yield* Effect.forEach(FOLDER_NAMES, (name) => Effect.map(ensureFolder(name), ([id, created]) => ({ name, id, created })));
  const folderMap = new Map(folders.map((f) => [f.name as string, f.id]));
  const foldersCreated = folders.filter((f) => f.created).length;
  console.log('');

  // 2. Fichiers, chemin disque → dossier logique
  const created = yield* Effect.forEach(scanned, (file) => indexFile(uploadsDir, folderMap, file));
  const filesCreated = created.filter(Boolean).length;
  const filesSkipped = created.length - filesCreated;

  console.log(`\n${c.cyan(c.bold(`═══════════════════════════════════════════════════════`))}`);
  console.log(`  ${c.green(`${plural(foldersCreated, 'dossier')} ${foldersCreated !== 1 ? 'créés' : 'créé'}`)}`);
  console.log(`  ${c.green(`${plural(filesCreated, 'fichier')} ${filesCreated !== 1 ? 'indexés' : 'indexé'}`)}`);
  if (filesSkipped > 0) {
    console.log(`  ${c.dim(`${plural(filesSkipped, 'fichier')} déjà indexé${filesSkipped !== 1 ? 's' : ''} (ignoré${filesSkipped !== 1 ? 's' : ''})`)}`);
  }
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));
});

// Entrée Effect : erreurs typées (ScriptError), code de sortie ; pool fermé dans tous les cas.
runScript('db:seed-media', program, { dispose: shutdownDb });
