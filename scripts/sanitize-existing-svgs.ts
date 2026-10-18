/**
 * Retroactive SVG sanitization script.
 *
 * Scans all SVG/SVGZ files under public/uploads/ and re-sanitizes them
 * using the same DOMPurify config as the upload pipeline.
 *
 * Usage: npx tsx scripts/sanitize-existing-svgs.ts [--dry-run]
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import DOMPurify from 'isomorphic-dompurify';

const UPLOADS_ROOT = join(process.cwd(), 'public', 'uploads');
const DRY_RUN = process.argv.includes('--dry-run');

async function* walkDir(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkDir(full);
    else yield full;
  }
}

async function main() {
  console.log(`🔍 Scanning SVGs in ${UPLOADS_ROOT}${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

  let scanned = 0;
  let modified = 0;
  let skipped = 0;

  for await (const filePath of walkDir(UPLOADS_ROOT)) {
    const ext = extname(filePath).toLowerCase();
    if (ext !== '.svg') continue;
    scanned++;

    const fileInfo = await stat(filePath);
    if (fileInfo.size > 256 * 1024) {
      console.warn(`  ⚠️  SKIP (too large: ${(fileInfo.size / 1024).toFixed(0)} KB): ${filePath}`);
      skipped++;
      continue;
    }

    const content = await readFile(filePath, 'utf-8');
    const sanitized = DOMPurify.sanitize(content, {
      USE_PROFILES: { svg: true, svgFilters: true },
    });

    if (sanitized === content) {
      continue; // Already clean
    }

    if (sanitized.length === 0) {
      console.warn(`  ❌ DANGEROUS (would be empty after sanitization): ${filePath}`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  🔧 WOULD SANITIZE: ${filePath}`);
    } else {
      await writeFile(filePath, sanitized, 'utf-8');
      console.log(`  ✅ SANITIZED: ${filePath}`);
    }
    modified++;
  }

  console.log(`\n📊 Results: ${scanned} SVG(s) scanned, ${modified} modified, ${skipped} skipped`);
  if (DRY_RUN && modified > 0) {
    console.log(`   Re-run without --dry-run to apply changes.`);
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
