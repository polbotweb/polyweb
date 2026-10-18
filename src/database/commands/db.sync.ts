import { Client } from 'pg';
import { type DbEnv, getDbUrl, maskUrl } from '../env';
import { c, confirmDestructive } from './_utils';
import { Effect } from 'effect';
import { inTransaction, runScript, ScriptError, scopedConnection, sqlStep, step } from './_effect';

// ─── Environnements valides ──────────────────────────────────────────
const VALID_ENVS: DbEnv[] = ['LOCAL', 'PROD', 'TEST'];

// ─── Parse arguments ─────────────────────────────────────────────────

function parseArgs(): { source: DbEnv; target: DbEnv } {
  const args = process.argv.slice(2).map(a => a.trim().toUpperCase());

  if (args.length !== 2) {
    console.error(c.red(c.bold(`\n❌ Usage : pnpm db:sync <SOURCE> <TARGET>`)));
    console.error(c.yellow(`   Environnements disponibles : ${VALID_ENVS.join(', ')}`));
    console.error(c.dim(`   Exemple : pnpm db:sync LOCAL PROD   (écrase PROD avec LOCAL)`));
    console.error(c.dim(`             pnpm db:sync PROD LOCAL   (écrase LOCAL avec PROD)`));
    console.error(c.dim(`             pnpm db:sync TEST LOCAL   (écrase LOCAL avec TEST)\n`));
    return process.exit(1);
  }

  const [rawSrc, rawTgt] = args;
  const invalid = [rawSrc, rawTgt].filter(e => !VALID_ENVS.includes(e as DbEnv));
  if (invalid.length) {
    console.error(c.red(c.bold(`\n❌ Environnement(s) invalide(s) : ${invalid.join(', ')}`)));
    console.error(c.yellow(`   Valeurs acceptées : ${VALID_ENVS.join(', ')}\n`));
    return process.exit(1);
  }

  if (rawSrc === rawTgt) {
    console.error(c.red(c.bold(`\n❌ Source et cible sont identiques : ${rawSrc}`)));
    console.error(c.yellow(`   Choisissez deux environnements différents.\n`));
    return process.exit(1);
  }

  return { source: rawSrc as DbEnv, target: rawTgt as DbEnv };
}

// ── Helpers ──────────────────────────────────────────────────────────

// Safe identifier regex — only allow normal PostgreSQL identifiers
const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

async function getTables(client: Client): Promise<string[]> {
  const res = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  );
  return res.rows.map(r => r.table_name);
}

async function copyTableData(from: Client, to: Client, table: string) {
  if (!SAFE_IDENT.test(table)) throw new Error(`Invalid table name: ${table}`);
  const { rows } = await from.query(`SELECT * FROM "${table}"`);
  if (rows.length === 0) {
    console.log(c.dim(`  [SKIP] ${table} — vide`));
    return;
  }
  const columns = Object.keys(rows[0]);
  for (const col of columns) {
    if (!SAFE_IDENT.test(col)) throw new Error(`Invalid column name: ${col}`);
  }
  const cols = columns.map(col => `"${col}"`).join(',');
  // node-pg envoie un tableau JS comme littéral de tableau Postgres ({…}) : invalide pour une
  // colonne json/jsonb (ex. sites.*). Ces valeurs sont donc resérialisées en JSON.
  const { rows: jsonCols } = await to.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND data_type IN ('json', 'jsonb')`,
    [table],
  );
  const isJson = new Set(jsonCols.map(r => r.column_name));
  const encode = (col: string, value: unknown) => (isJson.has(col) && value !== null && typeof value === 'object' ? JSON.stringify(value) : value);

  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const valueSets: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const row of batch) {
      const placeholders = columns.map(() => `$${paramIdx++}`);
      valueSets.push(`(${placeholders.join(',')})`);
      for (const col of columns) params.push(encode(col, row[col]));
    }

    await to.query(
      `INSERT INTO "${table}" (${cols}) VALUES ${valueSets.join(',')}`,
      params,
    );
  }
  console.log(c.green(`  [OK] ${table} (${rows.length} lignes)`));
}

/** Tables de la source absentes de la cible → échec (schéma à aligner avant la copie). */
const validateTargetSchema = (source: Client, target: Client) =>
  Effect.gen(function* () {
    const [sourceTables, targetTables] = yield* Effect.all([
      step('tables source', () => getTables(source)),
      step('tables cible', () => getTables(target)),
    ]);
    const missingTables = sourceTables.filter(table => !targetTables.includes(table));
    if (missingTables.length === 0) return sourceTables;
    console.error(c.red(c.bold(`\n❌ Schéma incompatible : la cible ne contient pas toutes les tables de la source.`)));
    console.error(c.yellow(`   Tables manquantes dans la cible :`));
    for (const table of missingTables) console.error(c.yellow(`     - ${table}`));
    console.error(c.yellow(`\n   Exécutez ${c.cyan('pnpm db:migrate')} sur la cible ou alignez le schéma cible avant de relancer.`));
    return yield* Effect.fail(new ScriptError({ step: 'schéma cible', cause: `tables manquantes : ${missingTables.join(', ')}` }));
  });

// ── Main ─────────────────────────────────────────────────────────────

const program = Effect.scoped(Effect.gen(function* () {
  const { source, target } = parseArgs();

  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   🔄 Sync ${source} → ${target}`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  const urlSource = getDbUrl(source);
  const urlTarget = getDbUrl(target);
  console.log(`  Source : ${c.bold(source)} ${c.dim(maskUrl(urlSource))}`);
  console.log(`  Cible  : ${c.bold(target)} ${c.dim(maskUrl(urlTarget))}`);
  console.log();

  yield* step('confirmation', () => confirmDestructive(`SYNC ${source} → ${target} (ÉCRASER ${target} avec les données de ${source})`));

  const [from, to] = yield* Effect.all([scopedConnection(source, urlSource), scopedConnection(target, urlTarget)]);
  const failed = [!from && source, !to && target].filter(Boolean);
  if (!from || !to) {
    console.error(c.red(c.bold(`\n❌ Connexion impossible : ${failed.join(' + ')}`)));
    console.error(c.yellow(`   Corrigez les identifiants/URLs ci-dessus dans .env puis relancez.`));
    return yield* Effect.fail(new ScriptError({ step: 'connexion', cause: failed.join(' + ') }));
  }

  const tables = yield* validateTargetSchema(from, to);
  if (tables.length === 0) {
    console.log(c.yellow('[INFO] Aucune table trouvée dans la source.'));
  } else {
    console.log(`\nSynchronisation de ${c.bold(String(tables.length))} tables…\n`);
    // Une seule transaction côté cible ; contraintes/triggers différés le temps de la copie.
    yield* inTransaction(to, Effect.gen(function* () {
      yield* sqlStep(to, 'session_replication_role', 'SET LOCAL session_replication_role = replica;');
      // Vidage de TOUTES les tables en une instruction, avant toute copie : un TRUNCATE … CASCADE
      // par table (ancien comportement) vidait les tables déjà copiées qui la référencent
      // (ex. « user » tronqué en dernier → account, blog_* … vides dans la cible).
      if (tables.some((t) => !SAFE_IDENT.test(t))) return yield* Effect.fail(new ScriptError({ step: 'tables', cause: 'nom de table invalide' }));
      yield* sqlStep(to, 'vidage de la cible', `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
      yield* Effect.forEach(tables, (table) => step(`copie ${table}`, () => copyTableData(from, to, table)), { discard: true });
    }));
  }
  console.log(c.green(c.bold('\n✔️  Synchronisation terminée.')));
}));

// Entrée Effect : erreurs typées (ScriptError), code de sortie ; connexions fermées dans tous les cas.
runScript('db:sync', program);
