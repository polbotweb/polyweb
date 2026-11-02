/**
 * POST /api/cron/audit-retention — purge le journal d'audit au-delà de la rétention
 * (`AUDIT_RETENTION_DAYS`, 1 an par défaut). Quotidien, ex. 03:30 Europe/Paris ; idempotent.
 */
import { Effect } from 'effect';
import { apiRoute, json } from '@/lib/effect/http';
import { requireCron } from '@/lib/effect/cron';
import { AppConfig } from '@/lib/effect/config';
import { auditRetentionDays, purgeAuditLog } from '@/core/audit/retention';

export const prerender = false;
export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    yield* requireCron(request);
    const days = yield* AppConfig.use((config) => Effect.succeed(auditRetentionDays(config.env)));
    const result = yield* purgeAuditLog(days);
    return json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  }),
);
