import { Client } from 'pg';
import { type DbEnv, getDbUrl, maskUrl, dbNameFromUrl } from '../env';
import { c, safeConnect } from './_utils';

// ─── Environnements valides ──────────────────────────────────────────
const VALID_ENVS: DbEnv[] = ['LOCAL', 'PROD', 'TEST'];
const ALL_PAIRS: [DbEnv, DbEnv][] = [['LOCAL', 'PROD'], ['LOCAL', 'TEST'], ['TEST', 'PROD']];

// ─── Parse arguments ─────────────────────────────────────────────────

function parseArgs(): [DbEnv, DbEnv][] {
  const args = process.argv.slice(2).map(a => a.trim().toUpperCase());

  // Sans argument → compare les 3 paires
  if (args.length === 0) return ALL_PAIRS;

  if (args.length !== 2) {
    console.error(c.red(c.bold(`\n❌ Usage : pnpm db:compare [ENV_A ENV_B]`)));
    console.error(c.yellow(`   Environnements disponibles : ${VALID_ENVS.join(', ')}`));
    console.error(c.dim(`   Sans argument : compare les 3 paires`));
    console.error(c.dim(`   Exemple : pnpm db:compare LOCAL PROD`));
    console.error(c.dim(`             pnpm db:compare TEST PROD\n`));
    return process.exit(1);
  }

  const [rawA, rawB] = args;
  const invalid = [rawA, rawB].filter(e => !VALID_ENVS.includes(e as DbEnv));
  if (invalid.length) {
    console.error(c.red(c.bold(`\n❌ Environnement(s) invalide(s) : ${invalid.join(', ')}`)));
    console.error(c.yellow(`   Valeurs acceptées : ${VALID_ENVS.join(', ')}\n`));
    return process.exit(1);
  }

  if (rawA === rawB) {
    console.error(c.red(c.bold(`\n❌ Les deux environnements sont identiques : ${rawA}`)));
    console.error(c.yellow(`   Choisissez deux environnements différents.\n`));
    return process.exit(1);
  }

  return [[rawA as DbEnv, rawB as DbEnv]];
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function getSchema(client: Client) {
  const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
  const columns = await client.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, column_name`);
  return { tables: tables.rows, columns: columns.rows };
}

// Safe identifier regex — only allow normal PostgreSQL identifiers
const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

async function getData(client: Client, table: string) {
  if (!SAFE_IDENT.test(table)) throw new Error(`Invalid table name: ${table}`);
  try {
    const res = await client.query(`SELECT * FROM "${table}" ORDER BY 1`);
    return res.rows;
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === '42P01') return null;
    throw e;
  }
}

interface SqlRow { [key: string]: unknown }

function diffRows(rowsA: SqlRow[], rowsB: SqlRow[]) {
  const setB = new Set(rowsB.map(b => JSON.stringify(b)));
  const setA = new Set(rowsA.map(a => JSON.stringify(a)));
  const aNotInB = rowsA.filter(a => !setB.has(JSON.stringify(a)));
  const bNotInA = rowsB.filter(b => !setA.has(JSON.stringify(b)));
  return { aNotInB, bNotInA };
}

// ─── Comparer une paire ──────────────────────────────────────────────

async function comparePair(
  envA: DbEnv, clientA: Client,
  envB: DbEnv, clientB: Client,
): Promise<boolean> {
  const schemaA = await getSchema(clientA);
  const schemaB = await getSchema(clientB);

  // ── ÉTAPE 1 : Tables ──────────────────────────────────────────
  const tablesA = schemaA.tables.map((t: SqlRow) => t.table_name as string);
  const tablesB = schemaB.tables.map((t: SqlRow) => t.table_name as string);
  const onlyA = tablesA.filter((t: string) => !tablesB.includes(t));
  const onlyB = tablesB.filter((t: string) => !tablesA.includes(t));

  console.log(c.cyan(c.bold(`\n── ÉTAPE 1 : STRUCTURE DES TABLES ─────────────────────`)));
  if (onlyA.length) {
    console.log(c.yellow(`  Uniquement dans ${envA} :`));
    for (const t of onlyA) console.log(c.yellow(`    + ${t}`));
  }
  if (onlyB.length) {
    console.log(c.yellow(`  Uniquement dans ${envB} :`));
    for (const t of onlyB) console.log(c.yellow(`    + ${t}`));
  }
  if (!onlyA.length && !onlyB.length) {
    console.log(c.green(`  ✔ Tables identiques (${tablesA.length})`));
  }

  // ── ÉTAPE 2 : Colonnes ────────────────────────────────────────
  const colKey = (col: SqlRow) => `${col.table_name}.${col.column_name}:${col.data_type}`;
  const colsA = schemaA.columns.map(colKey);
  const colsB = schemaB.columns.map(colKey);
  const colsOnlyA = colsA.filter((col: string) => !colsB.includes(col));
  const colsOnlyB = colsB.filter((col: string) => !colsA.includes(col));

  console.log(c.cyan(c.bold(`\n── ÉTAPE 2 : STRUCTURE DES COLONNES ───────────────────`)));
  if (colsOnlyA.length) {
    console.log(c.yellow(`  Uniquement dans ${envA} :`));
    for (const col of colsOnlyA) console.log(c.yellow(`    + ${col}`));
  }
  if (colsOnlyB.length) {
    console.log(c.yellow(`  Uniquement dans ${envB} :`));
    for (const col of colsOnlyB) console.log(c.yellow(`    + ${col}`));
  }
  if (!colsOnlyA.length && !colsOnlyB.length) {
    console.log(c.green(`  ✔ Colonnes identiques`));
  }

  // ── ÉTAPE 3 : Données ─────────────────────────────────────────
  const commonTables = tablesA.filter((t: string) => tablesB.includes(t));
  console.log(c.cyan(c.bold(`\n── ÉTAPE 3 : DONNÉES (${commonTables.length} tables communes) ────────`)));

  if (commonTables.length === 0) {
    console.log(c.yellow('  Aucune table commune — rien à comparer.'));
  }

  let totalDiffs = 0;
  for (const table of commonTables) {
    const dataA = await getData(clientA, table);
    const dataB = await getData(clientB, table);
    if (dataA === null || dataB === null) {
      console.log(c.red(`  ❗ ${table} — inaccessible dans l'une des bases`));
      totalDiffs++;
    } else if (dataA.length === 0 && dataB.length === 0) {
      console.log(c.dim(`  ⊘ ${table} — vide des deux côtés`));
    } else {
      const { aNotInB, bNotInA } = diffRows(dataA, dataB);
      if (aNotInB.length || bNotInA.length) {
        totalDiffs++;
        console.log(c.red(`  ❗ ${table} — ${aNotInB.length} ligne(s) ${envA} only, ${bNotInA.length} ligne(s) ${envB} only`));
        if (aNotInB.length <= 3) for (const r of aNotInB) console.log(c.dim(`      ${envA}: ${JSON.stringify(r)}`));
        if (bNotInA.length <= 3) for (const r of bNotInA) console.log(c.dim(`      ${envB}:  ${JSON.stringify(r)}`));
      } else {
        console.log(c.green(`  ✔ ${table} — identique (${dataA.length} lignes)`));
      }
    }
  }

  // ── Résumé de la paire ──────────────────────────────────────────
  const identical = totalDiffs === 0 && !onlyA.length && !onlyB.length && !colsOnlyA.length && !colsOnlyB.length;
  if (identical) {
    console.log(c.green(c.bold(`\n  ✔ ${envA} et ${envB} sont identiques.`)));
  } else {
    const parts: string[] = [];
    if (onlyA.length || onlyB.length) parts.push(`${onlyA.length + onlyB.length} diff(s) tables`);
    if (colsOnlyA.length || colsOnlyB.length) parts.push(`${colsOnlyA.length + colsOnlyB.length} diff(s) colonnes`);
    if (totalDiffs) parts.push(`${totalDiffs} table(s) avec données différentes`);
    console.log(c.yellow(c.bold(`\n  ⚠ Différences : ${parts.join(', ')}`)));
  }

  return identical;
}

// ─── Main ────────────────────────────────────────────────────────────

async function compare() {
  const pairs = parseArgs();
  const isFullScan = pairs.length > 1;

  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  if (isFullScan) {
    console.log(c.cyan(c.bold(`   🔍 Compare ALL (${pairs.map(([a, b]) => `${a}↔${b}`).join(', ')})`)));
  } else {
    console.log(c.cyan(c.bold(`   🔍 Compare ${pairs[0][0]} ↔ ${pairs[0][1]}`)));
  }
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════`)));
  console.log(c.bgRed(' Lecture seule — aucune modification ne sera effectuée. '));

  // ── Connexion unique par env (pas de duplication) ──────────────
  const neededEnvs = [...new Set(pairs.flat())] as DbEnv[];
  const connections = new Map<DbEnv, Client>();
  const failedEnvs: DbEnv[] = [];

  for (const env of neededEnvs) {
    const url = getDbUrl(env);
    console.log(`\n  ${env} : ${dbNameFromUrl(url)} ${c.dim(`(${maskUrl(url)})`)}`);
    const conn = await safeConnect(env, url);
    if (conn.ok) {
      connections.set(env, conn.client);
    } else {
      failedEnvs.push(env);
    }
  }

  if (failedEnvs.length > 0) {
    console.error(c.red(c.bold(`\n❌ Connexion impossible : ${failedEnvs.join(', ')}`)));
    console.error(c.yellow(`   Corrigez les identifiants/URLs dans .env puis relancez.`));
    for (const client of connections.values()) await client.end();
    process.exit(1);
  }

  // ── Comparer chaque paire ─────────────────────────────────────
  const results: { pair: string; identical: boolean }[] = [];

  for (const [envA, envB] of pairs) {
    console.log(c.cyan(c.bold(`\n\n┌─────────────────────────────────────────────────────┐`)));
    console.log(c.cyan(c.bold(`│  ${envA} ↔ ${envB}${' '.repeat(47 - envA.length - envB.length - 3)}│`)));
    console.log(c.cyan(c.bold(`└─────────────────────────────────────────────────────┘`)));

    const identical = await comparePair(envA, connections.get(envA)!, envB, connections.get(envB)!);
    results.push({ pair: `${envA} ↔ ${envB}`, identical });
  }

  // ── Résumé global (multi-paires) ──────────────────────────────
  if (isFullScan) {
    console.log(c.cyan(c.bold(`\n\n═══════════════════════════════════════════════════════`)));
    console.log(c.cyan(c.bold(`   📊 RÉSUMÉ GLOBAL`)));
    console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════`)));
    for (const { pair, identical } of results) {
      if (identical) {
        console.log(c.green(`  ✔ ${pair} — identiques`));
      } else {
        console.log(c.yellow(`  ⚠ ${pair} — différences détectées`));
      }
    }
  }

  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  // ── Fermer les connexions ─────────────────────────────────────
  for (const client of connections.values()) await client.end();
}

compare().catch(e => {
  console.error(c.red('[compare] Échec inattendu:'), e?.message || e);
  process.exit(1);
});