import { checkConnection, getPgClient, shutdownDb } from '../drizzle';
import { getDbUrl, getConnectionLabel, maskUrl } from '../env';
import { c, logTarget, formatPgError } from './_utils';
import { Effect } from 'effect';
import { runScript, ScriptError, sqlStep, step, withPgClient } from './_effect';

/** Échec affiché (message + URL masquée) puis code de sortie 1 via runScript. */
const fail = (step: string, message: string, ...details: string[]) =>
  Effect.sync(() => { console.error(c.red(`❌ ${message}`)); details.forEach((d) => console.error(d)); }).pipe(
    Effect.andThen(Effect.fail(new ScriptError({ step, cause: message }))),
  );

const program = Effect.gen(function* () {
  const dbUrl = getDbUrl();

  // --- Config summary ---
  console.log(c.bold('🔍 Configuration détectée:'));
  logTarget();

  // --- Validate URL format ---
  if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    return yield* fail('format DATABASE_URL', 'DATABASE_URL invalide. Format attendu: postgresql://...', `   URL fournie: ${maskUrl(dbUrl).substring(0, 50)}...`);
  }
  const placeholders = ['username', 'password', 'localhost:port', 'namedb', 'example.neon.tech'];
  if (placeholders.some(p => dbUrl.includes(p))) {
    return yield* fail('format DATABASE_URL', 'DATABASE_URL contient des placeholders non remplacés', '   Remplacez les valeurs fictives par vos vraies informations dans .env');
  }

  // --- Health check ---
  const { ok, latency, error: connError } = yield* step('health check', checkConnection);
  if (!ok) return yield* fail('connexion', formatPgError(connError), c.yellow(`   URL : ${maskUrl(dbUrl)}`));

  yield* withPgClient(getPgClient, (client) => Effect.gen(function* () {
    const [res, versionRes, tablesRes, constraints] = yield* Effect.all([
      sqlStep(client, 'identité', 'SELECT current_database() as db, current_user as "user", inet_server_addr() as host'),
      sqlStep<{ version: string }>(client, 'version', 'SELECT version()'),
      sqlStep<{ table_name: string }>(client, 'tables', `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`),
      sqlStep<{ conname: string; contype: string; table: string }>(client, 'contraintes', `
        SELECT conname, contype, relname as "table"
        FROM pg_constraint
        JOIN pg_class ON conrelid = pg_class.oid
        WHERE relnamespace = 'public'::regnamespace
        ORDER BY relname, conname;
      `),
    ]);
    console.log(c.green(`✅ Connexion OK (${latency}ms)`));
    console.log(`ENV: ${getConnectionLabel()}`);
    console.table(res.rows);

    // --- PostgreSQL version ---
    const versionStr = versionRes.rows[0]?.version ?? 'unknown';
    const match = versionStr.match(/PostgreSQL (\d+)\.(\d+)/);
    if (match) {
      if (parseInt(match[1], 10) < 14) {
        console.warn(c.yellow(`⚠️  PostgreSQL ${match[1]}.${match[2]} détecté. Version 14+ recommandée pour Drizzle ORM.`));
      } else {
        console.log(c.green(`✅ PostgreSQL ${match[1]}.${match[2]}`));
      }
    } else {
      console.log(c.dim(`   Version : ${versionStr}`));
    }

    // --- Tables ---
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
    if (constraints.rows.length > 0) {
      console.log('\n---\nContraintes principales :');
      for (const row of constraints.rows) console.log(` - [${row.contype}] ${row.conname} sur ${row.table}`);
    }
  }).pipe(
    Effect.tapError((error) => Effect.sync(() => {
      console.error(c.red(`❌ ${formatPgError(error.cause ?? error)}`));
      console.error(c.yellow(`   URL : ${maskUrl(dbUrl)}`));
    })),
  ));
});

// Entrée Effect : erreurs typées (ScriptError), code de sortie ; client rendu et pool fermé dans tous les cas.
runScript('db:check', program, { dispose: shutdownDb });
