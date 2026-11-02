/**
 * Nettoyage de tests du journal d'audit : la table est en ajout seul (déclencheur), la seule
 * suppression admise active `polyweb.audit_purge` dans sa transaction — comme la purge de rétention.
 */
import { sql, type SQL } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { auditLog } from '@/database/schemas';

export async function purgeAuditRows(where: SQL | undefined): Promise<void> {
  if (!where) return;
  await getDrizzle().transaction(async (tx) => {
    await tx.execute(sql`select set_config('polyweb.audit_purge', 'on', true)`);
    await tx.delete(auditLog).where(where);
  });
}
