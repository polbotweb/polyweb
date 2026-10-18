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

async function seedMedia() {
  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   📸 Seed Media — Indexation des fichiers existants`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  logTarget();
  await confirmProd('seed-media');

  const uploadsDir = join(process.cwd(), 'public', 'uploads');
  const scanned = scanUploads(uploadsDir);

  console.log(`\n${c.cyan(`[scan]`)} ${scanned.length} fichiers trouvés dans public/uploads/\n`);

  if (scanned.length === 0) {
    console.log(c.yellow('Aucun fichier à indexer.'));
    await shutdownDb();
    process.exit(0);
  }

  const db = getDrizzle();

  // 1. Create the 3 logical folders: Avatars, Brand, Médias
  const FOLDER_NAMES = ['Avatars', 'Brand', 'Médias'] as const;
  const folderMap = new Map<string, string>(); // name → id
  let foldersCreated = 0;

  for (const name of FOLDER_NAMES) {
    const [existing] = await db
      .select({ id: mediaFolders.id })
      .from(mediaFolders)
      .where(eq(mediaFolders.name, name))
      .limit(1);

    if (existing) {
      folderMap.set(name, existing.id);
      console.log(`  ${c.dim('↩')} Dossier existant: ${name}`);
    } else {
      const [created] = await db
        .insert(mediaFolders)
        .values({ name })
        .returning({ id: mediaFolders.id });
      folderMap.set(name, created.id);
      foldersCreated++;
      console.log(`  ${c.green('✔')} Dossier créé: ${name}`);
    }
  }

  console.log('');

  // 2. Insert files, mapping disk paths to logical folders
  let filesCreated = 0;
  let filesSkipped = 0;

  for (const file of scanned) {
    const url = `/uploads/${file.relativePath}`;

    // Check if already indexed
    const [existing] = await db
      .select({ id: mediaFiles.id })
      .from(mediaFiles)
      .where(eq(mediaFiles.url, url))
      .limit(1);

    if (existing) {
      filesSkipped++;
      continue;
    }

    const folderName = resolveFolder(file.subfolder);
    const folderId = folderMap.get(folderName) ?? null;

    // Try to get dimensions via sharp
    let width: number | null = null;
    let height: number | null = null;
    const RASTER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
    if (RASTER_TYPES.has(file.mimeType)) {
      try {
        const sharp = (await import('sharp')).default;
        const fullPath = join(uploadsDir, file.relativePath);
        const metadata = await sharp(fullPath).metadata();
        width = metadata.width ?? null;
        height = metadata.height ?? null;
      } catch {
        // Non-blocking
      }
    }

    await db.insert(mediaFiles).values({
      folderId,
      filename: file.filename,
      url,
      mimeType: file.mimeType,
      size: file.size,
      width,
      height,
    });

    filesCreated++;
    const dims = width && height ? ` (${width}×${height})` : '';
    console.log(`  ${c.green('✔')} ${file.relativePath}${dims}`);
  }

  console.log(`\n${c.cyan(c.bold(`═══════════════════════════════════════════════════════`))}`);
  console.log(`  ${c.green(`${foldersCreated} dossier${foldersCreated !== 1 ? 's' : ''} créé${foldersCreated !== 1 ? 's' : ''}`)}`);
  console.log(`  ${c.green(`${filesCreated} fichier${filesCreated !== 1 ? 's' : ''} indexé${filesCreated !== 1 ? 's' : ''}`)}`);
  if (filesSkipped > 0) {
    console.log(`  ${c.dim(`${filesSkipped} fichier${filesSkipped !== 1 ? 's' : ''} déjà indexé${filesSkipped !== 1 ? 's' : ''} (ignoré${filesSkipped !== 1 ? 's' : ''})`)}`);
  }
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  await shutdownDb();
}

seedMedia().catch((err) => {
  console.error(c.red(`[ERREUR] ${err.message}`));
  process.exit(1);
});
