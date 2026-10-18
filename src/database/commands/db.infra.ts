import path from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { getPgClient, shutdownDb } from '../drizzle';
import { c, logTarget, confirmProd } from './_utils';
import { splitSqlStatements } from './_migration-sql';
import type { PoolClient } from 'pg';
import { Effect } from 'effect';
import { inTransaction, runScript, ScriptError, sqlStep, step, withPgClient } from './_effect';

const INFRA_DIR = path.resolve(process.cwd(), 'src/database/infra');
const isDryRun = process.argv.includes('--dry-run');

/** Un fichier infra = une transaction ; en dry run, instructions seulement listées. */
const applyFile = (client: PoolClient, file: string) =>
  Effect.gen(function* () {
    const sql = yield* step(`lecture ${file}`, async () => readFileSync(path.join(INFRA_DIR, file), 'utf8'));
    const statements = splitSqlStatements(sql);
    const count = statements.length;
    console.log(c.green(c.bold(`\n[infra] → ${file} (${count} statement${count > 1 ? 's' : ''})`)));

    if (isDryRun) {
      for (const stmt of statements) console.log(c.dim(`  ↳ ${stmt.slice(0, 80).replace(/[\r\n]+/g, ' ')}…`));
      return count;
    }

    const fileStart = Date.now();
    yield* inTransaction(client, Effect.forEach(statements, (stmt, i) => sqlStep(client, `${file} #${i + 1}`, stmt), { discard: true })).pipe(
      Effect.tapError((error) => Effect.sync(() => console.error(c.red(`  ❌ Erreur dans ${file}: ${error.message}`)))),
    );
    console.log(c.dim(`  ✔ ${Date.now() - fileStart}ms`));
    return count;
  });

const program = Effect.gen(function* () {
  const label = isDryRun ? '🏛️  Infra DB — SQL avancé (DRY RUN)' : '🏛️  Infra DB — SQL avancé';
  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   ${label}`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  logTarget();
  if (!isDryRun) yield* step('confirmation PROD', () => confirmProd('db:infra'));

  if (!existsSync(INFRA_DIR)) {
    console.log(c.yellow(`[infra] Dossier introuvable: ${INFRA_DIR}`));
    console.log(c.cyan('Aucun script infra à appliquer.'));
    return;
  }
  const files = yield* step('lecture du dossier infra', async () => readdirSync(INFRA_DIR).filter((file) => file.endsWith('.sql')).sort());
  if (files.length === 0) {
    console.log(c.yellow('[infra] Aucun fichier .sql trouvé.'));
    return;
  }

  yield* withPgClient(getPgClient, (client) => Effect.gen(function* () {
    // Preflight: les migrations Drizzle doivent avoir été appliquées
    const { rows: migCheck } = yield* sqlStep(client, 'preflight migrations',
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '__drizzle_migrations'`);
    if (migCheck.length === 0) {
      console.error(c.red(c.bold('[infra] ❌ Table __drizzle_migrations introuvable.')));
      console.error(c.yellow('  → Lancez d\'abord : pnpm run db:migrate'));
      return yield* Effect.fail(new ScriptError({ step: 'preflight migrations', cause: '__drizzle_migrations introuvable' }));
    }

    const totalStart = Date.now();
    const counts = yield* Effect.forEach(files, (file) => applyFile(client, file));
    const totalStatements = counts.reduce((a, b) => a + b, 0);
    const elapsed = Date.now() - totalStart;
    if (isDryRun) {
      console.log(c.yellow(c.bold(`\n🔍 Dry run terminé : ${totalStatements} statements dans ${files.length} fichier(s).`)));
    } else {
      console.log(c.green(c.bold(`\n✔️  ${totalStatements} statements appliqués (${elapsed}ms)`)));
    }
    console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════\n`)));
  }));
});

// Entrée Effect : erreurs typées (ScriptError), code de sortie ; client rendu et pool fermé dans tous les cas.
runScript('db:infra', program, { dispose: shutdownDb });
