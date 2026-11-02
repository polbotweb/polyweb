/**
 * GET /api/organizations/audit-export?organizationId=…&action=&module=&outcome=&from=&to=
 * Export CSV du journal d'audit d'UNE organisation (C6-A). Accès : permission `audit:read`
 * dans cette organisation (propriétaire / administrateur ou rôle dynamique) ; un refus est
 * journalisé. Les cellules sont neutralisées contre l'injection de formules.
 */
import { Effect } from 'effect';
import { apiRoute } from '@/lib/effect/http';
import { legacyJson, rateLimit, retryAfterSeconds } from '@/lib/effect/route';
import { tenantPermission } from '@/core/permissions/tenant';
import { auditAccessDecision } from '@/lib/effect/action';
import { exportOrganizationAudit, parseAuditFilters } from '@/core/audit/query';
import { extractIp, logAuditEventEffect } from '@/lib/audit';

export const prerender = false;

const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export const GET = apiRoute((context) =>
  Effect.gen(function* () {
    const user = context.locals.user;
    if (!user) return legacyJson({ error: 'Unauthorized' }, 401);
    const organizationId = context.url.searchParams.get('organizationId') ?? '';
    if (!ID_RE.test(organizationId)) return legacyJson({ error: 'Not found' }, 404);

    const decision = yield* tenantPermission(user, organizationId, { audit: ['read'] });
    if (!decision.allowed) {
      yield* auditAccessDecision({ userId: user.id, permissions: { audit: ['read'] }, organizationId, siteId: null, outcome: 'denied', reason: decision.reason });
      return legacyJson({ error: 'Forbidden' }, 403);
    }

    const rl = yield* rateLimit(`org-audit-export:${user.id}`, { window: 60, max: 5 });
    if (!rl.allowed) return legacyJson({ error: 'Too many requests' }, 429, { 'Retry-After': retryAfterSeconds(rl) });

    const { page: _page, ...filters } = parseAuditFilters(context.url.searchParams);
    const csv = yield* exportOrganizationAudit(organizationId, filters);
    yield* logAuditEventEffect({
      userId: user.id,
      action: 'audit.log.export',
      module: 'audit',
      organizationId,
      resource: 'audit_log',
      metadata: { filters: { action: filters.action ?? null, module: filters.module ?? null, outcome: filters.outcome ?? null } },
      ipAddress: extractIp(context.request.headers, context.clientAddress),
      userAgent: context.request.headers.get('user-agent'),
    });
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-${date}.csv"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }),
);
