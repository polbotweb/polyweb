import { checkConnection, getPgClient, shutdownDb } from '../drizzle';
import { getDbUrl, getConnectionLabel, maskUrl } from '../env';
import { c, logTarget, formatPgError } from './_utils';

(async () => {
  const dbUrl = getDbUrl();

  // --- Config summary ---
  console.log(c.bold('🔍 Configuration détectée:'));
  logTarget();

  // --- Validate URL format ---
  if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    console.error(c.red('❌ DATABASE_URL invalide. Format attendu: postgresql://...'));
    console.error('   URL fournie:', maskUrl(dbUrl).substring(0, 50) + '...');
    process.exit(1);
  }

  const placeholders = ['username', 'password', 'localhost:port', 'namedb', 'example.neon.tech'];
  if (placeholders.some(p => dbUrl.includes(p))) {
    console.error(c.red('❌ DATABASE_URL contient des placeholders non remplacés'));
    console.error('   Remplacez les valeurs fictives par vos vraies informations dans .env');
    process.exit(1);
  }

  // --- Health check ---
  const { ok, latency, error: connError } = await checkConnection();
  if (!ok) {
    console.error(c.red(`❌ ${formatPgError(connError)}`));
    console.error(c.yellow(`   URL : ${maskUrl(dbUrl)}`));
    await shutdownDb();
    process.exit(1);
  }

  const client = await getPgClient();
  try {
    const res = await client.query('SELECT current_database() as db, current_user as "user", inet_server_addr() as host');
    console.log(c.green(`✅ Connexion OK (${latency}ms)`));
    console.log(`ENV: ${getConnectionLabel()}`);
    console.table(res.rows);

    // --- PostgreSQL version ---
    const versionRes = await client.query('SELECT version()');
    const versionStr = versionRes.rows[0]?.version ?? 'unknown';
    const match = versionStr.match(/PostgreSQL (\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      if (major < 14) {
        console.warn(c.yellow(`⚠️  PostgreSQL ${match[1]}.${match[2]} détecté. Version 14+ recommandée pour Drizzle ORM.`));
      } else {
        console.log(c.green(`✅ PostgreSQL ${match[1]}.${match[2]}`));
      }
    } else {
      console.log(c.dim(`   Version : ${versionStr}`));
    }

    // --- Tables ---
    const tablesRes = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const tables = tablesRes.rows.map(r => r.table_name);

    console.log('\n---\nTables présentes dans la base :');
    if (tables.length === 0) {
      console.log(c.red(c.bold('  0 (aucune table trouvée)')));
      console.log(`  La base existe mais ne contient aucune table.`);
      console.log(`  Lancez : ${c.cyan('npm run db:migrate')} ou ${c.cyan('npm run db:generate')}`);
    } else {
      for (const t of tables) console.log(' -', t);
    }

    // --- Constraints ---
    const constraints = await client.query(`
      SELECT conname, contype, relname as "table"
      FROM pg_constraint
      JOIN pg_class ON conrelid = pg_class.oid
      WHERE relnamespace = 'public'::regnamespace
      ORDER BY relname, conname;
    `);
    if (constraints.rows.length > 0) {
      console.log('\n---\nContraintes principales :');
      for (const row of constraints.rows) {
        console.log(` - [${row.contype}] ${row.conname} sur ${row.table}`);
      }
    }
  } catch (e: unknown) {
    console.error(c.red(`❌ ${formatPgError(e)}`));
    console.error(c.yellow(`   URL : ${maskUrl(dbUrl)}`));
    process.exit(1);
  } finally {
    client.release();
    await shutdownDb();
  }
})();
