/**
 * `pnpm db:seed` est idempotent : sur une base jetable (migrate → infra → seed ×2), le second seed
 * n'ajoute aucune ligne (ex. menus de navigation dupliqués qui cassaient la régression visuelle).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { getDbUrl } from '@database/env';

const baseUrl = new URL(getDbUrl());
const scratchName = `${baseUrl.pathname.slice(1)}_seedidem_${Date.now().toString(36)}`;
const scratchUrl = new URL(baseUrl.href);
scratchUrl.pathname = `/${scratchName}`;
const env = { ...process.env, DB_ENV: 'LOCAL', DATABASE_URL_LOCAL: scratchUrl.href, NODE_ENV: 'test' };

const admin = () => new pg.Client({ connectionString: baseUrl.href });
const run = (cmd: string, extra: string[] = []) =>
  execFileSync('pnpm', ['exec', 'tsx', `src/database/commands/${cmd}.ts`, ...extra], { env, stdio: 'pipe', timeout: 180_000 });

async function tableCounts(): Promise<Record<string, number>> {
  const client = new pg.Client({ connectionString: scratchUrl.href });
  await client.connect();
  try {
    const { rows } = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1");
    const out: Record<string, number> = {};
    for (const { table_name } of rows) {
      const r = await client.query<{ n: string }>(`select count(*)::text as n from "${table_name}"`);
      out[table_name] = Number(r.rows[0]!.n);
    }
    return out;
  } finally { await client.end(); }
}

beforeAll(async () => {
  const c = admin(); await c.connect();
  try { await c.query(`create database "${scratchName}"`); } finally { await c.end(); }
  run('db.migrate');
  run('db.infra');
}, 300_000);

afterAll(async () => {
  const c = admin(); await c.connect();
  try { await c.query(`drop database if exists "${scratchName}" with (force)`); } finally { await c.end(); }
}, 60_000);

describe('db:seed idempotent', () => {
  it('un second seed ne crée aucune ligne', () => tableCounts().then(async () => {
    run('db.seed');
    const first = await tableCounts();
    expect(first.navigation_menus ?? 0).toBeGreaterThan(0);
    run('db.seed');
    const second = await tableCounts();
    const grown = Object.keys(second).filter((t) => second[t] !== first[t]).map((t) => `${t}: ${first[t]} → ${second[t]}`);
    expect(grown).toEqual([]);
  }), 300_000);
});
