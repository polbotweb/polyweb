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
import { Effect } from 'effect';
import { runScript, step } from './_effect';

const force = process.argv.includes('--force');

/** Chemin absolu sur le disque correspondant à une URL publique `/uploads/…`. */
function diskPathFor(publicUrl: string): string {
  return join(process.cwd(), 'public', publicUrl.replace(/^\/+/, ''));
}

type Row = { id: string; url: string; mimeType: string; size: number };
type Outcome = { kind: 'generated'; before: number; after: number } | { kind: 'skipped' } | { kind: 'failed' };

/** Un média : fichier absent → « en échec » (non bloquant) ; erreur de génération/mise à jour → échec du script. */
const backfillOne = (row: Row) =>
  Effect.gen(function* () {
    const disk = diskPathFor(row.url);
    const buffer = yield* Effect.tryPromise(() => readFile(disk)).pipe(Effect.option);
    if (buffer._tag === 'None') {
      console.log(c.yellow(`  ⚠ Fichier introuvable, ignoré : ${row.url}`));
      return { kind: 'failed' } as Outcome;
    }
    const variants = yield* step(`variantes ${row.url}`, () =>
      generateResponsiveVariants({ buffer: buffer.value, mimeType: row.mimeType, url: row.url, dir: join(disk, '..') }));
    if (variants.length === 0) return { kind: 'skipped' } as Outcome;

    yield* step(`enregistrement ${row.url}`, () =>
      getDrizzle().update(mediaFiles).set({ variants: serializeVariants(variants) }).where(eq(mediaFiles.id, row.id)));
    const smallest = variants[0];
    console.log(c.green(`  ✔ ${row.url}`) + c.dim(`  ${variants.length} variantes  ${formatBytes(row.size)} → ${formatBytes(smallest.size)}`));
    return { kind: 'generated', before: row.size, after: smallest.size } as Outcome;
  });

const program = Effect.gen(function* () {
  console.log(c.cyan(c.bold('\n  🖼️  Backfill Media Variants — WebP responsive\n')));
  logTarget();

  const rows = yield* step('sélection des médias', () => getDrizzle()
    .select({ id: mediaFiles.id, url: mediaFiles.url, mimeType: mediaFiles.mimeType, size: mediaFiles.size, variants: mediaFiles.variants })
    .from(mediaFiles)
    .where(force ? undefined : or(isNull(mediaFiles.variants), eqOp(mediaFiles.variants, [] as unknown as never))));

  if (rows.length === 0) {
    console.log(c.yellow('  ℹ Aucun média à traiter.\n'));
    return;
  }

  // Séquentiel (sharp est déjà multi-thread ; évite de saturer la mémoire sur de gros originaux).
  const outcomes = yield* Effect.forEach(rows, backfillOne);
  const generated = outcomes.filter((o): o is Extract<Outcome, { kind: 'generated' }> => o.kind === 'generated');
  const skipped = outcomes.filter((o) => o.kind === 'skipped').length;
  const failed = outcomes.filter((o) => o.kind === 'failed').length;
  const bytesBefore = generated.reduce((n, o) => n + o.before, 0);
  const bytesAfter = generated.reduce((n, o) => n + o.after, 0);

  console.log('');
  console.log(c.bold(`  Générées : ${generated.length}   Ignorées : ${skipped}   En échec : ${failed}`));
  if (generated.length > 0) {
    const ratio = bytesBefore > 0 ? Math.round((1 - bytesAfter / bytesBefore) * 100) : 0;
    console.log(c.green(`  Poids de la plus petite variante : ${formatBytes(bytesBefore)} → ${formatBytes(bytesAfter)} (-${ratio} %)`));
  }
  console.log('');
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}


// Entrée Effect : erreurs typées (ScriptError), code de sortie ; pool fermé dans tous les cas.
runScript('db:backfill-variants', program, { dispose: shutdownDb });
