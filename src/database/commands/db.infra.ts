import path from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { getPgClient, shutdownDb } from '../drizzle';
import { c, logTarget, confirmProd } from './_utils';
import { splitSqlStatements } from './_migration-sql';

const INFRA_DIR = path.resolve(process.cwd(), 'src/database/infra');
const isDryRun = process.argv.includes('--dry-run');

async function main() {
  const label = isDryRun ? '🏛️  Infra DB — SQL avancé (DRY RUN)' : '🏛️  Infra DB — SQL avancé';
  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   ${label}`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  logTarget();
  if (!isDryRun) await confirmProd('db:infra');

  if (!existsSync(INFRA_DIR)) {
    console.log(c.yellow(`[infra] Dossier introuvable: ${INFRA_DIR}`));
    console.log(c.cyan('Aucun script infra à appliquer.'));
    return;
  }

  const files = readdirSync(INFRA_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log(c.yellow('[infra] Aucun fichier .sql trouvé.'));
    return;
  }

  const client = await getPgClient();
  try {
    // Preflight: les migrations Drizzle doivent avoir été appliquées
    const { rows: migCheck } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '__drizzle_migrations'`,
    );
    if (migCheck.length === 0) {
      console.error(c.red(c.bold('[infra] ❌ Table __drizzle_migrations introuvable.')));
      console.error(c.yellow('  → Lancez d\'abord : pnpm run db:migrate'));
      process.exit(1);
    }

    const totalStart = Date.now();
    let totalStatements = 0;

    for (const file of files) {
      const fullPath = path.join(INFRA_DIR, file);
      const sql = readFileSync(fullPath, 'utf8');
      const statements = splitSqlStatements(sql);

      const count = statements.length;
      console.log(c.green(c.bold(`\n[infra] → ${file} (${count} statement${count > 1 ? 's' : ''})`)));

      if (isDryRun) {
        for (const stmt of statements) {
          console.log(c.dim(`  ↳ ${stmt.slice(0, 80).replace(/[\r\n]+/g, ' ')}…`));
        }
        totalStatements += count;
        continue;
      }

      const fileStart = Date.now();
      await client.query('BEGIN');
      try {
        for (const stmt of statements) {
          await client.query(stmt);
        }
        await client.query('COMMIT');
        totalStatements += count;
        console.log(c.dim(`  ✔ ${Date.now() - fileStart}ms`));
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(c.red(`  ❌ Erreur dans ${file}: ${errMsg}`));
        throw error;
      }
    }

    const elapsed = Date.now() - totalStart;
    if (isDryRun) {
      console.log(c.yellow(c.bold(`\n🔍 Dry run terminé : ${totalStatements} statements dans ${files.length} fichier(s).`)));
    } else {
      console.log(c.green(c.bold(`\n✔️  ${totalStatements} statements appliqués (${elapsed}ms)`)));
    }
    console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════\n`)));
  } finally {
    client.release();
    await shutdownDb();
  }
}

main().catch((error) => {
  console.error(c.red('[infra] Échec:'), error);
  process.exit(1);
});