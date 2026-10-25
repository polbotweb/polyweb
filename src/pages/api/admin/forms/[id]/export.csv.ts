/** GET /api/admin/forms/{id}/export.csv — export CSV des soumissions (session + formSubmission:export). */
import { Effect } from 'effect';
import { apiRoute } from '@/lib/effect/http';
import { requireSessionPermission } from '@/lib/effect/auth';
import { getAdminSite } from '@/lib/platform/admin';
import { DbError } from '@/lib/effect/errors';
import { logAuditEvent, extractIp } from '@/lib/audit';
import { exportSubmissionsCsv, getForm } from '@/modules/forms/domain/forms';

export const prerender = false;
export const GET = apiRoute((ctx) =>
  Effect.gen(function* () {
    const user = yield* requireSessionPermission(ctx.locals, { formSubmission: ['export'] });
    const site = yield* Effect.tryPromise({ try: () => getAdminSite(ctx), catch: (cause) => new DbError({ operation: 'admin.site', cause }) });
    const form = yield* getForm(site.id, ctx.params.id ?? '');
    const locale = ctx.url.searchParams.get('locale') ?? 'fr';
    const csv = yield* exportSubmissionsCsv(form, locale);
    void logAuditEvent({ userId: user.id, action: 'CONTENT_EXPORT', resource: 'form', resourceId: form.id, metadata: { kind: 'form-submissions' }, ipAddress: extractIp(ctx.request.headers, ctx.clientAddress), userAgent: ctx.request.headers.get('user-agent') });
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${form.slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
        'cache-control': 'private, no-store',
      },
    });
  }),
);
