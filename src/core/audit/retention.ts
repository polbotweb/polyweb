/**
 * Rétention du journal d'audit (C5-A) : 1 an par défaut, configurable par
 * `AUDIT_RETENTION_DAYS` (minimum 30 jours). Seule voie de suppression : la purge active
 * `polyweb.audit_purge` dans SA transaction, ce que le déclencheur append-only autorise.
 */
import { Effect } from 'effect';
import { sql } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { dbTry } from '@/lib/effect/run';
import { logAuditEventEffect } from '@/lib/audit';

export const DEFAULT_AUDIT_RETENTION_DAYS = 365;
export const MIN_AUDIT_RETENTION_DAYS = 30;
const BATCH_SIZE = 1000;

/** Durée de rétention effective (valeur invalide → défaut ; borne basse 30 jours). */
export function auditRetentionDays(env: Readonly<Record<string, string | undefined>>): number {
  const parsed = Number.parseInt(env.AUDIT_RETENTION_DAYS ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_AUDIT_RETENTION_DAYS;
  return Math.max(MIN_AUDIT_RETENTION_DAYS, parsed);
}

const deleteBatch = (days: number) =>
  dbTry('audit.purgeBatch', () =>
    getDrizzle().transaction(async (tx) => {
      await tx.execute(sql`select set_config('polyweb.audit_purge', 'on', true)`);
      const result = await tx.execute(
        sql`delete from audit_log where id in (select id from audit_log where created_at < now() - make_interval(days => ${days}) limit ${BATCH_SIZE})`,
      );
      return result.rowCount ?? 0;
    }),
  );

/** Purge par lots des entrées plus anciennes que `days` jours ; la purge elle-même est auditée. */
export const purgeAuditLog = (days: number) =>
  Effect.gen(function* () {
    let total = 0;
    let deleted = 0;
    do {
      deleted = yield* deleteBatch(days);
      total += deleted;
    } while (deleted === BATCH_SIZE);
    yield* logAuditEventEffect({ action: 'audit.log.purge', module: 'audit', resource: 'audit_log', metadata: { days, deleted: total } });
    return { days, deleted: total };
  });
