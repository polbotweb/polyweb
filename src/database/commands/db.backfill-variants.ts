/**
 * db.backfill-variants — Génère les variantes WebP responsive des médias
 * existants qui n'en ont pas encore, puis les enregistre dans
 * `media_files.variants`.
 *
 * Run: pnpm db:backfill-variants
 *
 * ─── Pourquoi ce backfill est nécessaire ──────────────────────────────
 *
 * Les variantes sont produites à l'upload (src/media/upload.ts), donc tout
 * média uploaded après cette migration en bénéficie. Mais les médias déjà en
 * base n'en ont pas : sans ce passage, le `<picture>` retombe sur l'original
 * plein résolution — c'est exactement le cas des 2 photos de démo de 3 Mo
 * qui plafonnaient le LCP du blog à 4,6 s.
 *
 * Le passage est idempotent : un média qui a déjà des variantes est ignoré
 * (relançable sans risque). `--force` régénère tout.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq, isNull, or, eq as eqOp } from 'drizzle-orm';
import { getDrizzle, shutdownDb } from '../drizzle';
import { mediaFiles } from '../schemas';
import { generateResponsiveVariants, serializeVariants } from '@/media/variants';
import { c, logTarget } from './_utils';

const force = process.argv.includes('--force');

/** Chemin absolu sur le disque correspondant à une URL publique `/uploads/…`. */
function diskPathFor(publicUrl: string): string {
  return join(process.cwd(), 'public', publicUrl.replace(/^\/+/, ''));
}

async function backfillVariants() {
  console.log(c.cyan(c.bold('\n  🖼️  Backfill Media Variants — WebP responsive\n')));
  logTarget();

  const db = getDrizzle();

  const rows = await db
    .select({
      id: mediaFiles.id,
      url: mediaFiles.url,
      mimeType: mediaFiles.mimeType,
      size: mediaFiles.size,
      variants: mediaFiles.variants,
    })
    .from(mediaFiles)
    .where(
      force
        ? undefined
        : or(isNull(mediaFiles.variants), eqOp(mediaFiles.variants, [] as unknown as never)),
    );

  if (rows.length === 0) {
    console.log(c.yellow('  ℹ Aucun média à traiter.\n'));
    await shutdownDb();
    return;
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const row of rows) {
    const disk = diskPathFor(row.url);
    let buffer: Buffer;
    try {
      buffer = await readFile(disk);
    } catch {
      console.log(c.yellow(`  ⚠ Fichier introuvable, ignoré : ${row.url}`));
      failed++;
      continue;
    }

    const variants = await generateResponsiveVariants({
      buffer,
      mimeType: row.mimeType,
      url: row.url,
      dir: join(disk, '..'),
    });

    if (variants.length === 0) {
      skipped++;
      continue;
    }

    const smallest = variants[0];
    bytesBefore += row.size;
    bytesAfter += smallest.size;
    generated++;

    await db
      .update(mediaFiles)
      .set({ variants: serializeVariants(variants) })
      .where(eq(mediaFiles.id, row.id));

    console.log(
      c.green(`  ✔ ${row.url}`) +
        c.dim(`  ${variants.length} variantes  ${formatBytes(row.size)} → ${formatBytes(smallest.size)}`),
    );
  }

  console.log('');
  console.log(c.bold(`  Générées : ${generated}   Ignorées : ${skipped}   En échec : ${failed}`));
  if (generated > 0) {
    const ratio = bytesBefore > 0 ? Math.round((1 - bytesAfter / bytesBefore) * 100) : 0;
    console.log(
      c.green(
        `  Poids de la plus petite variante : ${formatBytes(bytesBefore)} → ${formatBytes(bytesAfter)} (-${ratio} %)`,
      ),
    );
  }
  console.log('');

  await shutdownDb();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

backfillVariants().catch((err) => {
  console.error(c.red(`[ERREUR] ${err.message}`));
  process.exit(1);
});
