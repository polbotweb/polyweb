/**
 * Consultation du journal d'audit d'une organisation (C6-A) : filtres, pagination et export CSV.
 * La requête est TOUJOURS bornée par `organization_id` : aucun paramètre ne permet de lire
 * le journal d'une autre organisation.
 */
import { Effect } from 'effect';
import { and, count, desc, eq, gte, like, lt, type SQL } from 'drizzle-orm';
import { getDrizzle } from '@/database/drizzle';
import { auditLog, user } from '@/database/schemas';
import { dbTry } from '@/lib/effect/run';

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_EXPORT_LIMIT = 10_000;
export const AUDIT_OUTCOMES = ['success', 'denied', 'failure'] as const;
export type AuditOutcomeFilter = (typeof AUDIT_OUTCOMES)[number];

export interface AuditFilters {
  readonly action?: string;
  readonly module?: string;
  readonly outcome?: AuditOutcomeFilter;
  readonly from?: Date;
  readonly to?: Date;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

/** Lecture stricte des filtres (paramètres d'URL) ; toute valeur invalide est ignorée (pur). */
export function parseAuditFilters(params: URLSearchParams): AuditFilters & { page: number } {
  const token = (k: string) => {
    const v = params.get(k)?.trim() ?? '';
    return TOKEN_RE.test(v) ? v : undefined;
  };
  const date = (k: string, endOfDay: boolean) => {
    const v = params.get(k) ?? '';
    if (!DATE_RE.test(v)) return undefined;
    const d = new Date(`${v}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return undefined;
    return endOfDay ? new Date(d.getTime() + 86_400_000) : d;
  };
  const outcome = params.get('outcome');
  const page = Number.parseInt(params.get('page') ?? '1', 10);
  return {
    action: token('action'),
    module: token('module'),
    outcome: (AUDIT_OUTCOMES as readonly string[]).includes(outcome ?? '') ? (outcome as AuditOutcomeFilter) : undefined,
    from: date('from', false),
    to: date('to', true),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

function whereOf(organizationId: string, f: AuditFilters): SQL {
  const parts: SQL[] = [eq(auditLog.organizationId, organizationId)];
  if (f.action) parts.push(like(auditLog.action, `${escapeLike(f.action)}%`));
  if (f.module) parts.push(eq(auditLog.module, f.module));
  if (f.outcome) parts.push(eq(auditLog.outcome, f.outcome));
  if (f.from) parts.push(gte(auditLog.createdAt, f.from));
  if (f.to) parts.push(lt(auditLog.createdAt, f.to));
  return and(...parts) as SQL;
}

export interface AuditRow {
  readonly id: string;
  readonly createdAt: Date;
  readonly action: string;
  readonly module: string | null;
  readonly outcome: string;
  readonly userName: string | null;
  readonly siteId: string | null;
  readonly resource: string | null;
  readonly resourceId: string | null;
}

const selectRows = (organizationId: string, f: AuditFilters, limit: number, offset: number) =>
  dbTry('audit.query', () =>
    getDrizzle()
      .select({
        id: auditLog.id, createdAt: auditLog.createdAt, action: auditLog.action, module: auditLog.module, outcome: auditLog.outcome,
        userName: user.name, siteId: auditLog.siteId, resource: auditLog.resource, resourceId: auditLog.resourceId,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.userId))
      .where(whereOf(organizationId, f))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(limit)
      .offset(offset),
  ) as Effect.Effect<AuditRow[], unknown>;

export const queryOrganizationAudit = (organizationId: string, f: AuditFilters, page: number) =>
  Effect.gen(function* () {
    const [total] = yield* dbTry('audit.count', () => getDrizzle().select({ n: count() }).from(auditLog).where(whereOf(organizationId, f)));
    const pages = Math.max(1, Math.ceil((total?.n ?? 0) / AUDIT_PAGE_SIZE));
    const current = Math.min(page, pages);
    const rows = yield* selectRows(organizationId, f, AUDIT_PAGE_SIZE, (current - 1) * AUDIT_PAGE_SIZE);
    return { rows, page: current, pages, total: total?.n ?? 0 };
  });

/** Cellule CSV sûre : guillemets doublés et neutralisation des formules de tableur (pur). */
export function csvCell(value: unknown): string {
  let s = value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export const AUDIT_CSV_HEADER = ['created_at', 'action', 'module', 'outcome', 'user', 'site_id', 'resource', 'resource_id'] as const;

export function auditCsv(rows: readonly AuditRow[]): string {
  const lines = [AUDIT_CSV_HEADER.join(',')];
  for (const r of rows) lines.push([r.createdAt, r.action, r.module, r.outcome, r.userName, r.siteId, r.resource, r.resourceId].map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export const exportOrganizationAudit = (organizationId: string, f: AuditFilters) => selectRows(organizationId, f, AUDIT_EXPORT_LIMIT, 0).pipe(Effect.map(auditCsv));
