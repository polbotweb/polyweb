/**
 * Sauvegarde / restauration (brique m) — Effect.
 *
 * Archive `polyweb-<horodatage>.tar.gz` contenant :
 *   - manifest.json  (format, date, version, migrations appliquées, sha256)
 *   - db.dump        (pg_dump --format=custom, sans propriétaires ni privilèges)
 *   - media/…        (optionnel : objets du Storage, tous pilotes)
 *
 * Les identifiants Postgres passent par variables d'environnement PG* (jamais
 * en argument de ligne de commande, visible dans `ps`).
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Data, Duration, Effect, Schema } from 'effect';
import { Storage } from '@/lib/storage';
import { decode } from '@/lib/effect/schema';

export class BackupError extends Data.TaggedError('BackupError')<{ readonly step: string; readonly reason: string; readonly cause?: unknown }> {
  override get message() {
    return `Backup ${this.step}: ${this.reason}`;
  }
}

export const BACKUP_FORMAT = 1;

export const Manifest = Schema.Struct({
  format: Schema.Literal(BACKUP_FORMAT),
  app: Schema.Literal('polyweb'),
  createdAt: Schema.String,
  release: Schema.NullOr(Schema.String),
  database: Schema.Struct({ file: Schema.Literal('db.dump'), sha256: Schema.String, bytes: Schema.Number, migrations: Schema.Array(Schema.String) }),
  media: Schema.Struct({ included: Schema.Boolean, count: Schema.Number, bytes: Schema.Number }),
});
export type Manifest = typeof Manifest.Type;

/** Variables PG* à partir d'une URL postgres:// (mot de passe hors argv). */
export function pgEnvFromUrl(url: string): Record<string, string> {
  const u = new URL(url);
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new BackupError({ step: 'config', reason: 'DATABASE_URL invalide' });
  const env: Record<string, string> = {
    PGHOST: decodeURIComponent(u.hostname) || 'localhost',
    PGPORT: u.port || '5432',
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
  if (u.username) env.PGUSER = decodeURIComponent(u.username);
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  const sslmode = u.searchParams.get('sslmode');
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

/** Lance une commande avec délai ; stderr conservé (tronqué) pour le diagnostic. */
export const runCommand = (step: string, cmd: string, args: readonly string[], opts: { env?: Record<string, string>; timeout?: Duration.Input; cwd?: string } = {}) =>
  Effect.callback<string, BackupError>((resume, signal) => {
    const child = spawn(cmd, [...args], { env: { ...process.env, ...opts.env }, cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], signal });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => (out = (out + c).slice(-100_000)));
    child.stderr.on('data', (c) => (err = (err + c).slice(-4000)));
    child.on('error', (cause) => resume(Effect.fail(new BackupError({ step, reason: `${cmd} introuvable ou interrompu`, cause }))));
    child.on('close', (code) =>
      resume(code === 0 ? Effect.succeed(out) : Effect.fail(new BackupError({ step, reason: `${cmd} a échoué (code ${code}) : ${err.trim().split('\n').slice(-3).join(' | ')}` }))),
    );
  }).pipe(
    Effect.timeoutOrElse({ duration: opts.timeout ?? Duration.minutes(30), orElse: () => Effect.fail(new BackupError({ step, reason: `${cmd} : délai dépassé` })) }),
    Effect.withSpan(`backup.${step}`),
  );

const sha256File = (path: string) =>
  Effect.tryPromise({
    try: () =>
      new Promise<string>((res, rej) => {
        const h = createHash('sha256');
        createReadStream(path).on('data', (c) => h.update(c)).on('end', () => res(h.digest('hex'))).on('error', rej);
      }),
    catch: (cause) => new BackupError({ step: 'checksum', reason: 'lecture impossible', cause }),
  });

const fsTry = <A>(step: string, f: () => Promise<A>) => Effect.tryPromise({ try: f, catch: (cause) => new BackupError({ step, reason: cause instanceof Error ? cause.message : String(cause), cause }) });

const appliedMigrations = (pgEnv: Record<string, string>) =>
  runCommand('migrations', 'psql', ['-X', '-A', '-t', '-c', 'SELECT id FROM __drizzle_migrations ORDER BY created_at, id'], { env: pgEnv, timeout: '30 seconds' }).pipe(
    Effect.map((out) => out.split('\n').map((s) => s.trim()).filter(Boolean)),
    Effect.catchTag('BackupError', () => Effect.succeed([] as string[])),
  );

export interface BackupOptions {
  readonly databaseUrl: string;
  readonly outDir: string;
  readonly includeMedia: boolean;
  readonly release?: string | null;
  /** Conserver les N archives les plus récentes de outDir (0 = tout garder). */
  readonly keep?: number;
  readonly now?: Date;
}

export const createBackup = (opts: BackupOptions) =>
  Effect.gen(function* () {
    const pgEnv = pgEnvFromUrl(opts.databaseUrl);
    const now = opts.now ?? new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
    const work = yield* fsTry('tmp', () => mkdtemp(join(tmpdir(), 'polyweb-backup-')));
    return yield* Effect.gen(function* () {
      const dump = join(work, 'db.dump');
      yield* runCommand('pg_dump', 'pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--compress=6', `--file=${dump}`], { env: pgEnv });
      const [sha, size, migrations] = yield* Effect.all([sha256File(dump), fsTry('stat', () => stat(dump)), appliedMigrations(pgEnv)]);

      let mediaCount = 0;
      let mediaBytes = 0;
      if (opts.includeMedia) {
        const storage = yield* Storage;
        const objects = (yield* storage.list('').pipe(Effect.mapError((cause) => new BackupError({ step: 'media', reason: 'listing impossible', cause })))).filter(
          (o) => !o.key.split('/').some((s) => s.startsWith('.')),
        );
        yield* Effect.forEach(
          objects,
          (o) =>
            Effect.gen(function* () {
              const body = yield* storage.get(o.key).pipe(Effect.mapError((cause) => new BackupError({ step: 'media', reason: `lecture de ${o.key}`, cause })));
              const target = join(work, 'media', ...o.key.split('/'));
              yield* fsTry('media', async () => {
                await mkdir(dirname(target), { recursive: true });
                await writeFile(target, body);
              });
              mediaCount++;
              mediaBytes += body.byteLength;
            }),
          { concurrency: 8, discard: true },
        );
      }

      const manifest: Manifest = {
        format: BACKUP_FORMAT,
        app: 'polyweb',
        createdAt: now.toISOString(),
        release: opts.release ?? null,
        database: { file: 'db.dump', sha256: sha, bytes: size.size, migrations },
        media: { included: opts.includeMedia, count: mediaCount, bytes: mediaBytes },
      };
      yield* fsTry('manifest', () => writeFile(join(work, 'manifest.json'), JSON.stringify(manifest, null, 2)));
      yield* fsTry('outdir', () => mkdir(opts.outDir, { recursive: true }));
      const archive = resolve(opts.outDir, `polyweb-${stamp}.tar.gz`);
      const entries = ['manifest.json', 'db.dump', ...(opts.includeMedia && mediaCount > 0 ? ['media'] : [])];
      yield* runCommand('archive', 'tar', ['-czf', archive, '-C', work, ...entries], { timeout: '30 minutes' });
      const removed = opts.keep && opts.keep > 0 ? yield* pruneBackups(opts.outDir, opts.keep) : [];
      return { archive, manifest, removed };
    }).pipe(Effect.ensuring(Effect.promise(() => rm(work, { recursive: true, force: true }))));
  }).pipe(Effect.withSpan('backup.create'));

/** Supprime les archives polyweb-*.tar.gz les plus anciennes au-delà de `keep`. */
export const pruneBackups = (dir: string, keep: number) =>
  Effect.gen(function* () {
    const files = (yield* fsTry('prune', () => readdir(dir))).filter((f) => /^polyweb-\d{8}-\d{6}Z\.tar\.gz$/.test(f)).sort().reverse();
    const old = files.slice(keep);
    yield* Effect.forEach(old, (f) => fsTry('prune', () => rm(join(dir, f))), { discard: true });
    return old;
  });

/** Lit et vérifie une archive (manifest + somme de contrôle) dans un dossier temporaire. */
export const inspectBackup = (archive: string) =>
  Effect.gen(function* () {
    const work = yield* fsTry('tmp', () => mkdtemp(join(tmpdir(), 'polyweb-restore-')));
    const listing = yield* runCommand('list', 'tar', ['-tzf', archive], { timeout: '10 minutes' });
    // Refus des chemins absolus / remontées (archive forgée).
    for (const entry of listing.split('\n').filter(Boolean)) {
      if (entry.startsWith('/') || entry.split('/').includes('..')) return yield* new BackupError({ step: 'verify', reason: `entrée d'archive interdite : ${entry}` });
    }
    yield* runCommand('extract', 'tar', ['-xzf', archive, '-C', work, '--no-same-owner', '--no-same-permissions'], { timeout: '30 minutes' });
    const raw = yield* fsTry('manifest', async () => JSON.parse(await readFile(join(work, 'manifest.json'), 'utf8')) as unknown);
    const manifest = yield* decode(Manifest)(raw).pipe(Effect.mapError((e) => new BackupError({ step: 'manifest', reason: e.message })));
    const sha = yield* sha256File(join(work, 'db.dump'));
    if (sha !== manifest.database.sha256) return yield* new BackupError({ step: 'verify', reason: 'somme de contrôle de db.dump invalide' });
    return { work, manifest };
  });

export interface RestoreOptions {
  readonly archive: string;
  readonly databaseUrl: string;
  readonly restoreMedia: boolean;
  /** Migrations connues du code ; refuse une sauvegarde plus récente que le code. */
  readonly knownMigrations: readonly string[];
}

export const restoreBackup = (opts: RestoreOptions) =>
  Effect.gen(function* () {
    const { work, manifest } = yield* inspectBackup(opts.archive);
    return yield* Effect.gen(function* () {
      const known = new Set(opts.knownMigrations);
      const unknown = manifest.database.migrations.filter((m) => !known.has(m));
      if (unknown.length > 0) {
        return yield* new BackupError({ step: 'compat', reason: `sauvegarde plus récente que le code (migrations inconnues : ${unknown.slice(0, 5).join(', ')}) — mettez le code à jour d'abord` });
      }
      const pgEnv = pgEnvFromUrl(opts.databaseUrl);
      // Le schéma public est vidé puis recréé dans une seule transaction.
      yield* runCommand('reset', 'psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-c', 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'], { env: pgEnv, timeout: '5 minutes' });
      yield* runCommand('pg_restore', 'pg_restore', ['--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', `--dbname=${pgEnv.PGDATABASE}`, join(work, 'db.dump')], { env: pgEnv });

      let mediaRestored = 0;
      if (opts.restoreMedia && manifest.media.included && manifest.media.count > 0) {
        const storage = yield* Storage;
        const root = join(work, 'media');
        const files = yield* fsTry('media', () => readdir(root, { recursive: true, withFileTypes: true }));
        yield* Effect.forEach(
          files.filter((f) => f.isFile()),
          (f) =>
            Effect.gen(function* () {
              const full = join(f.parentPath, f.name);
              const key = relative(root, full).split(sep).join('/');
              const body = yield* fsTry('media', () => readFile(full));
              yield* storage.put(key, body, { contentType: contentTypeFor(key) }).pipe(Effect.mapError((cause) => new BackupError({ step: 'media', reason: `écriture de ${key}`, cause })));
              mediaRestored++;
            }),
          { concurrency: 8, discard: true },
        );
      }
      return { manifest, mediaRestored };
    }).pipe(Effect.ensuring(Effect.promise(() => rm(work, { recursive: true, force: true }))));
  }).pipe(Effect.withSpan('backup.restore'));

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', gif: 'image/gif', ico: 'image/x-icon', pdf: 'application/pdf' };
const contentTypeFor = (key: string) => MIME[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
