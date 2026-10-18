import { getPgClient, shutdownDb } from '../drizzle';
import { getConnectionLabel } from '../env';
import { c, logTarget, confirmProd } from './_utils';

const DEFAULT_RETENTION_DAYS = 90;

async function main() {
  const label = getConnectionLabel();
  const days = Math.max(
    1,
    parseInt(process.env.AUDIT_RETENTION_DAYS ?? String(DEFAULT_RETENTION_DAYS), 10) || DEFAULT_RETENTION_DAYS,
  );

  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   🧹 Cleanup Audit Logs — ${label} (rétention : ${days}j)`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  logTarget();
  await confirmProd('cleanup-audit');

  const client = await getPgClient();

  try {
    const BATCH_SIZE = 1000;
    let totalDeleted = 0;
    let deleted: number;
    do {
      const result = await client.query(
        `DELETE FROM audit_log WHERE id IN (
          SELECT id FROM audit_log WHERE created_at < NOW() - INTERVAL '1 day' * $1 LIMIT $2
        )`,
        [days, BATCH_SIZE],
      );
      deleted = result.rowCount ?? 0;
      totalDeleted += deleted;
      if (deleted > 0) {
        console.log(c.dim(`  Lot supprimé : ${deleted} entrée(s)…`));
      }
    } while (deleted === BATCH_SIZE);
    console.log(c.green(c.bold(`\n✔️  ${totalDeleted} entrée(s) supprimée(s) (> ${days} jours).`)));
  } finally {
    client.release();
    await shutdownDb();
  }
}

main().catch((error) => {
  console.error(c.red('[cleanup-audit] Échec:'), error);
  process.exit(1);
});
