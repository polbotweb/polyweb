/** db:cleanup-audit — supprime par lots les entrées d'audit plus anciennes que AUDIT_RETENTION_DAYS (défaut 90). */
import { Effect } from 'effect';
import { getPgClient, shutdownDb } from '../drizzle';
import { getConnectionLabel } from '../env';
import { c, logTarget, confirmProd } from './_utils';
import { runScript, step } from './_effect';

const DEFAULT_RETENTION_DAYS = 90;
const BATCH_SIZE = 1000;

const program = Effect.gen(function* () {
  const label = getConnectionLabel();
  const days = Math.max(1, parseInt(process.env.AUDIT_RETENTION_DAYS ?? String(DEFAULT_RETENTION_DAYS), 10) || DEFAULT_RETENTION_DAYS);

  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   🧹 Cleanup Audit Logs — ${label} (rétention : ${days}j)`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  logTarget();
  yield* step('confirmation', () => confirmProd('cleanup-audit'));

  const totalDeleted = yield* Effect.acquireUseRelease(
    step('connexion', () => getPgClient()),
    (client) =>
      Effect.gen(function* () {
        let total = 0;
        let deleted: number;
        do {
          const result = yield* step('delete batch', () =>
            client.query(`DELETE FROM audit_log WHERE id IN (SELECT id FROM audit_log WHERE created_at < NOW() - INTERVAL '1 day' * $1 LIMIT $2)`, [days, BATCH_SIZE]),
          );
          deleted = result.rowCount ?? 0;
          total += deleted;
          if (deleted > 0) console.log(c.dim(`  Lot supprimé : ${deleted} entrée(s)…`));
        } while (deleted === BATCH_SIZE);
        return total;
      }),
    (client) => Effect.sync(() => client.release()),
  );
  console.log(c.green(c.bold(`\n✔️  ${totalDeleted} entrée(s) supprimée(s) (> ${days} jours).`)));
});

runScript('cleanup-audit', program, { dispose: shutdownDb });
