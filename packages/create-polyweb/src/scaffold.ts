/**
 * create-polyweb — logique (Effect). Aucune dépendance au dépôt Polyweb :
 * ce paquet est publiable seul.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import { Data, Duration, Effect, Schema } from 'effect';

export class ScaffoldError extends Data.TaggedError('ScaffoldError')<{ readonly step: string; readonly reason: string; readonly cause?: unknown }> {
  override get message() {
    return `${this.step} : ${this.reason}`;
  }
}

export const Options = Schema.Struct({
  directory: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  name: Schema.String.pipe(Schema.check(Schema.isPattern(/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/), Schema.isMaxLength(214))),
  from: Schema.String,
  adapter: Schema.Literals(['node', 'vercel']),
  storage: Schema.Literals(['local', 's3', 'r2']),
  search: Schema.Literals(['postgres', 'meilisearch', 'pagefind']),
  payments: Schema.Boolean,
  siteName: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(120))),
  install: Schema.Boolean,
  git: Schema.Boolean,
});
export type Options = typeof Options.Type;

export const DEFAULT_TEMPLATE = 'github:polbotweb/polyweb#main';

/** Fichiers/dossiers jamais copiés dans un nouveau projet. */
const EXCLUDED = new Set(['node_modules', '.git', 'dist', '.astro', '.vercel', '.env', 'logs', 'test-results', 'playwright-report', 'coverage', 'backups', '.DS_Store']);
const EXCLUDED_PATHS = ['tests/reports', 'packages/create-polyweb', 'public/uploads'];

export function shouldCopy(rel: string): boolean {
  const parts = rel.split(sep).join('/').split('/');
  if (parts.some((p) => EXCLUDED.has(p) || /^\.env\.(?!example$)/.test(p))) return false;
  // Dossiers de travail `tmp*` à la racine (ignorés par .gitignore) : jamais copiés — ils peuvent
  // apparaître/disparaître pendant la copie (ex. tests parallèles) et n'appartiennent pas au modèle.
  if (parts.length > 0 && /^tmp/.test(parts[0]!)) return false;
  const norm = parts.join('/');
  return !EXCLUDED_PATHS.some((p) => norm === p || norm.startsWith(`${p}/`));
}

export function parseTemplate(from: string): { kind: 'local'; path: string } | { kind: 'github'; owner: string; repo: string; ref: string } {
  const m = /^github:([\w.-]+)\/([\w.-]+)(?:#([\w./-]+))?$/.exec(from);
  if (m) return { kind: 'github', owner: m[1]!, repo: m[2]!, ref: m[3] ?? 'main' };
  return { kind: 'local', path: resolve(from) };
}

const fsTry = <A>(step: string, f: () => Promise<A>) =>
  Effect.tryPromise({ try: f, catch: (cause) => new ScaffoldError({ step, reason: cause instanceof Error ? cause.message : String(cause), cause }) });

export const run = (step: string, cmd: string, args: readonly string[], cwd: string, timeout: Duration.Input = '10 minutes') =>
  Effect.callback<void, ScaffoldError>((resume, signal) => {
    const child = spawn(cmd, [...args], { cwd, stdio: ['ignore', 'inherit', 'pipe'], signal });
    let err = '';
    child.stderr.on('data', (c) => (err = (err + c).slice(-2000)));
    child.on('error', (cause) => resume(Effect.fail(new ScaffoldError({ step, reason: `${cmd} introuvable`, cause }))));
    child.on('close', (code) => resume(code === 0 ? Effect.void : Effect.fail(new ScaffoldError({ step, reason: `${cmd} a échoué (${code}) ${err.trim().split('\n').at(-1) ?? ''}` }))));
  }).pipe(Effect.timeoutOrElse({ duration: timeout, orElse: () => Effect.fail(new ScaffoldError({ step, reason: `${cmd} : délai dépassé` })) }));

/** Télécharge l'archive GitHub (codeload) et l'extrait ; renvoie le dossier source. */
const fetchGithub = (t: { owner: string; repo: string; ref: string }) =>
  Effect.gen(function* () {
    const dir = yield* fsTry('download', () => mkdtemp(join(tmpdir(), 'create-polyweb-')));
    const url = `https://codeload.github.com/${t.owner}/${t.repo}/tar.gz/${encodeURIComponent(t.ref)}`;
    const body = yield* Effect.tryPromise({
      try: async (signal) => {
        const res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) });
        if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
        return new Uint8Array(await res.arrayBuffer());
      },
      catch: (cause) => new ScaffoldError({ step: 'download', reason: cause instanceof Error ? cause.message : 'téléchargement impossible', cause }),
    }).pipe(Effect.retry({ times: 2 }));
    const archive = join(dir, 'template.tar.gz');
    yield* fsTry('download', () => writeFile(archive, body));
    const src = join(dir, 'src');
    yield* fsTry('download', () => mkdir(src));
    yield* run('extract', 'tar', ['-xzf', archive, '-C', src, '--strip-components=1', '--no-same-owner'], dir);
    return { src, cleanup: dir };
  });

const copyTemplate = (src: string, dest: string) =>
  fsTry('copy', () =>
    cp(src, dest, {
      recursive: true,
      filter: (from) => {
        const rel = relative(src, from);
        return rel === '' || shouldCopy(rel);
      },
    }),
  );

const ensureEmptyTarget = (dest: string) =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => stat(dest).then(() => true, () => false));
    if (!exists) return;
    const entries = yield* fsTry('target', () => readdir(dest));
    if (entries.filter((e) => e !== '.git').length > 0) return yield* new ScaffoldError({ step: 'target', reason: `le dossier ${dest} n'est pas vide` });
  });

const secret = () => randomBytes(32).toString('base64url');

/** Remplace ou ajoute `KEY=value` (décommente une ligne `# KEY=` existante). */
export function setEnv(text: string, key: string, value: string): string {
  const re = new RegExp(`^#?\\s*${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  return re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}

export function buildEnv(example: string, o: Options, slug: string): string {
  const db = slug.replace(/[^a-z0-9_]/g, '_');
  let env = example;
  const set = (k: string, v: string) => (env = setEnv(env, k, v));
  set('DB_ENV', 'LOCAL');
  set('DATABASE_URL_LOCAL', `postgresql://postgres:postgres@localhost:5432/${db}`);
  set('DATABASE_URL_TEST', `postgresql://postgres:postgres@localhost:5432/${db}_test`);
  set('BETTER_AUTH_SECRET', secret());
  set('POLYWEB_SIGNING_SECRET', secret());
  set('CRON_SECRET', secret());
  set('SITE_NAME', o.siteName.replace(/[\r\n]/g, ' '));
  set('ASTRO_ADAPTER', o.adapter);
  set('STORAGE_DRIVER', o.storage);
  set('SEARCH_DRIVER', o.search);
  set('PAYMENTS_ENABLED', String(o.payments));
  return env;
}

export const scaffold = (input: unknown, log: (msg: string) => void = () => {}) =>
  Effect.gen(function* () {
    const o = yield* Schema.decodeUnknownEffect(Options)(input).pipe(Effect.mapError((e) => new ScaffoldError({ step: 'options', reason: e.message })));
    const dest = resolve(o.directory);
    yield* ensureEmptyTarget(dest);
    const t = parseTemplate(o.from);
    log(`• Modèle : ${o.from}`);
    const source = t.kind === 'local' ? { src: t.path, cleanup: null as string | null } : yield* fetchGithub(t);
    yield* Effect.gen(function* () {
      const isPolyweb = yield* fsTry('template', async () => JSON.parse(await readFile(join(source.src, 'package.json'), 'utf8')) as { name?: string });
      if (!isPolyweb.name) return yield* new ScaffoldError({ step: 'template', reason: 'package.json du modèle invalide' });
      yield* copyTemplate(source.src, dest);
    }).pipe(Effect.ensuring(source.cleanup ? Effect.promise(() => rm(source.cleanup!, { recursive: true, force: true })) : Effect.void));
    log(`• Fichiers copiés dans ${dest}`);

    // package.json : nom, version, privé.
    const pkgPath = join(dest, 'package.json');
    const pkg = yield* fsTry('package.json', async () => JSON.parse(await readFile(pkgPath, 'utf8')) as Record<string, unknown>);
    pkg.name = o.name;
    pkg.version = '0.1.0';
    pkg.private = true;
    delete pkg.repository;
    delete pkg.bugs;
    delete pkg.homepage;
    yield* fsTry('package.json', () => writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`));

    // .env avec secrets aléatoires.
    const example = yield* fsTry('.env', () => readFile(join(dest, '.env.example'), 'utf8').catch(() => ''));
    yield* fsTry('.env', () => writeFile(join(dest, '.env'), buildEnv(example, o, basename(o.name)), { mode: 0o600 }));
    log('• .env généré (secrets aléatoires)');

    if (o.git) {
      yield* run('git', 'git', ['init', '-q', '-b', 'main'], dest);
      yield* run('git', 'git', ['add', '-A'], dest);
      yield* run('git', 'git', ['-c', 'user.name=create-polyweb', '-c', 'user.email=create-polyweb@localhost', 'commit', '-q', '-m', 'chore: projet créé avec create-polyweb'], dest);
      log('• Dépôt git initialisé');
    }
    if (o.install) {
      log('• Installation des dépendances (pnpm install)…');
      yield* run('install', 'pnpm', ['install'], dest, '20 minutes');
    }
    return { dest, options: o };
  });

export function nextSteps(dest: string, o: Options): string {
  const cd = relative(process.cwd(), dest) || '.';
  return [
    '',
    `✔ Projet « ${o.name} » créé.`,
    '',
    'Étapes suivantes :',
    `  cd ${cd}`,
    ...(o.install ? [] : ['  pnpm install']),
    '  # ajustez DATABASE_URL_LOCAL dans .env, puis :',
    '  pnpm db:migrate && pnpm db:seed',
    '  pnpm admin:create',
    '  pnpm dev',
    ...(o.storage !== 'local' ? ['', `  Stockage ${o.storage} : renseignez S3_* dans .env.`] : []),
    ...(o.search === 'meilisearch' ? ['  Meilisearch : renseignez MEILISEARCH_HOST / MEILISEARCH_API_KEY.'] : []),
    ...(o.search === 'pagefind' ? ['  Pagefind : lancez « pnpm search:pagefind » après « pnpm build ».'] : []),
    '',
  ].join('\n');
}
