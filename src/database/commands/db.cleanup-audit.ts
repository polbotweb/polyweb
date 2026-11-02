/** db:cleanup-audit — purge manuelle du journal d'audit (même logique que le cron /api/cron/audit-retention ; AUDIT_RETENTION_DAYS, défaut 365). */
import { Effect } from 'effect';
import { shutdownDb } from '../drizzle';
import { auditRetentionDays, purgeAuditLog } from '../../core/audit/retention';
import { getConnectionLabel } from '../env';
import { c, logTarget, confirmProd } from './_utils';
import { runScript, step } from './_effect';

const program = Effect.gen(function* () {
  const label = getConnectionLabel();
  const days = auditRetentionDays(process.env);

  console.log(c.cyan(c.bold(`\n═══════════════════════════════════════════════════════`)));
  console.log(c.cyan(c.bold(`   🧹 Cleanup Audit Logs — ${label} (rétention : ${days}j)`)));
  console.log(c.cyan(c.bold(`═══════════════════════════════════════════════════════\n`)));

  logTarget();
  yield* step('confirmation', () => confirmProd('cleanup-audit'));

  const { deleted: totalDeleted } = yield* purgeAuditLog(days);
  console.log(c.green(c.bold(`\n✔️  ${totalDeleted} entrée(s) supprimée(s) (> ${days} jours).`)));
});

runScript('cleanup-audit', program, { dispose: shutdownDb });
