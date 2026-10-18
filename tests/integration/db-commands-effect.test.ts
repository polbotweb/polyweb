/**
 * Commandes db:* migrées en Effect (étapes nommées, client rendu, transaction) : exécutées
 * pour de vrai sur une base jetable (jamais sur la base de test partagée).
 *  - db:baseline : base créée hors migrations → toutes les migrations marquées ; relance sans effet.
 *  - db:reset : confirmation « oui » → tables et historique supprimés ; « non » → annulé, rien touché.
 *  - db:migrate : base vide → toutes les migrations appliquées (une transaction chacune) ; relance sans effet.
 *  - db:check : connexion OK sur la base migrée ; URL invalide → code de sortie 1.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import pg from 'pg';
import 'dotenv/config';

const base = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL_LOCAL ?? '';
const scratchName = `polyweb_cmd_${Date.now().toString(36)}`;
const adminUrl = Object.assign(new URL(base), { pathname: '/postgres' }).toString();
const scratchUrl = Object.assign(new URL(base), { pathname: `/${scratchName}` }).toString();

const admin = () => new pg.Client({ connectionString: adminUrl });
const scratch = async <T>(f: (c: pg.Client) => Promise<T>) => {
  const c = new pg.Client({ connectionString: scratchUrl });
  await c.connect();
  try { return await f(c); } finally { await c.end(); }
};
const cmd = (file: string, input = '') =>
  execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', `src/database/commands/${file}`], {
    env: { ...process.env, DB_ENV: 'LOCAL', DATABASE_URL_LOCAL: scratchUrl, DATABASE_URL_TEST: scratchUrl, NODE_ENV: 'test' },
    input,
    encoding: 'utf8',
  });

beforeAll(async () => {
  const c = admin(); await c.connect();
  await c.query(`CREATE DATABASE ${scratchName}`);
  await c.end();
});

afterAll(async () => {
  const c = admin(); await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await c.end();
});

describe('commandes db:* Effect (base jetable)', () => {
  it('db:baseline : marque toutes les migrations sur une base existante, puis ne fait plus rien', async () => {
    await scratch((c) => c.query('CREATE TABLE legacy (id int)'));
    const out = cmd('db.baseline.ts');
    const expected = readdirSync('src/database/migrations').filter((f) => f.endsWith('.sql')).length;
    expect(out).toContain(`${expected} migration(s)`);
    expect(await scratch(async (c) => (await c.query('SELECT count(*)::int AS n FROM __drizzle_migrations')).rows[0].n)).toBe(expected);
    expect(cmd('db.baseline.ts')).toContain('déjà rempli');
  }, 60_000);

  it('db:reset : « non » annule ; « oui » supprime les tables et l’historique', async () => {
    cmd('db.reset.ts', 'non\n');
    const tables = async () => (await scratch((c) => c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`))).rows.map((r) => r.table_name);
    expect(await tables()).toContain('legacy');
    expect(cmd('db.reset.ts', 'oui\n')).toContain('Reset complet');
    expect(await tables()).not.toContain('legacy');
  }, 60_000);

  it('db:migrate : applique toutes les migrations puis ne fait plus rien', async () => {
    const out = cmd('db.migrate.ts');
    expect(out).toContain('Toutes les migrations appliquées');
    const expected = readdirSync('src/database/migrations').filter((f) => f.endsWith('.sql')).length;
    expect(await scratch(async (c) => (await c.query('SELECT count(*)::int AS n FROM __drizzle_migrations')).rows[0].n)).toBe(expected);
    expect(await scratch(async (c) => (await c.query(`SELECT to_regclass('public.pages') AS t`)).rows[0].t)).toBe('pages');
    expect(cmd('db.migrate.ts')).toContain('Aucune migration en attente');
  }, 120_000);

  it('db:check : OK sur la base migrée ; URL invalide → échec (code 1)', () => {
    // db:check refuse (inchangé) toute URL contenant un mot « placeholder » (ex. un mot de passe
    // local littéralement « password ») : dans ce cas seul le chemin d'échec est vérifiable ici.
    const placeholder = ['username', 'password', 'localhost:port', 'namedb', 'example.neon.tech'].some((p) => scratchUrl.includes(p));
    if (!placeholder) {
      const out = cmd('db.check.ts');
      expect(out).toContain('Connexion OK');
      expect(out).toContain('pages');
    }
    let status = 0;
    try {
      execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/database/commands/db.check.ts'], {
        env: { ...process.env, DB_ENV: 'LOCAL', DATABASE_URL_LOCAL: 'mysql://nope', DATABASE_URL_TEST: 'mysql://nope', NODE_ENV: 'test' },
        encoding: 'utf8', stdio: 'pipe',
      });
    } catch (e) { status = (e as { status: number }).status; }
    expect(status).toBe(1);
  }, 60_000);
});
