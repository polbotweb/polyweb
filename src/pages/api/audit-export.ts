import type { APIRoute } from "astro";
import { fetchAdminAuditLogs, type AuditFilters } from "@/lib/auth-data";
import { logAuditEvent, extractIp } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";

export const prerender = false;

const MAX_EXPORT_ROWS = 5000;

/**
 * GET /api/audit-export?action=...&userId=...&from=...&to=...
 * Exports audit logs as CSV. Requires admin auth.
 */
export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rl = checkRateLimit(`audit-export:${user.id}`, { window: 60, max: 5 });
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const params = context.url.searchParams;
  const filters: AuditFilters = {};

  const action = params.get("action");
  if (action) filters.action = action;
  const userId = params.get("userId");
  if (userId) filters.userId = userId;
  const from = params.get("from");
  if (from) {
    const d = new Date(from);
    if (!isNaN(d.getTime())) filters.from = d;
  }
  const to = params.get("to");
  if (to) {
    const d = new Date(to);
    if (!isNaN(d.getTime())) filters.to = d;
  }

  const { rows } = await fetchAdminAuditLogs(
    context.request.headers,
    1,
    MAX_EXPORT_ROWS,
    filters,
  );

  // Log the export action itself for audit trail
  void logAuditEvent({
    userId: user.id,
    action: 'AUDIT_LOG_ACCESS',
    resource: 'audit_export',
    resourceId: null,
    metadata: { action: filters.action ?? null, userId: filters.userId ?? null, from: from ?? null, to: to ?? null, rowCount: rows.length },
    ipAddress: extractIp(context.request.headers, context.clientAddress),
    userAgent: context.request.headers.get('user-agent'),
  });

  // Build CSV
  const header = "id,date,user,action,resource,resourceId,ip";
  const csvRows = rows.map((r) =>
    [
      escapeCsv(r.id),
      escapeCsv(r.createdAt?.toISOString() ?? ""),
      escapeCsv(r.userName ?? ""),
      escapeCsv(r.action ?? ""),
      escapeCsv(r.resource ?? ""),
      escapeCsv(r.resourceId ?? ""),
      escapeCsv(r.ipAddress ?? ""),
    ].join(","),
  );
  const csv = [header, ...csvRows].join("\n");

  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
};

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
