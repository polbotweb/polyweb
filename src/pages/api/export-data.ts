import type { APIRoute } from 'astro';
import { eq, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { schema, withDbActorContext } from '@database/drizzle';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAuditEvent, extractIp } from '@/lib/audit';

export const prerender = false;

export const GET: APIRoute = async ({ request, clientAddress }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const userId = session.user.id;

  // Rate limit: 5 exports per 60 seconds per user
  const rl = checkRateLimit(`export:${userId}`, { window: 60, max: 5 });
  if (!rl.allowed) {
    return Response.json({ error: 'Trop de requêtes' }, { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } });
  }

  const { userResult, accounts, sessions, memberships, invitations, auditLogs } = await withDbActorContext(
    { userId, isAdmin: session.user.role === 'admin' },
    async (db) => {
      const [userResult, accounts, sessions, memberships, invitations, auditLogs] = await Promise.all([
        db
          .select({
            id: schema.user.id,
            name: schema.user.name,
            email: schema.user.email,
            emailVerified: schema.user.emailVerified,
            image: schema.user.image,
            createdAt: schema.user.createdAt,
            updatedAt: schema.user.updatedAt,
            username: schema.user.username,
            displayUsername: schema.user.displayUsername,
            role: schema.user.role,
          })
          .from(schema.user)
          .where(eq(schema.user.id, userId)),

        db
          .select({
            id: schema.account.id,
            providerId: schema.account.providerId,
            accountId: schema.account.accountId,
            createdAt: schema.account.createdAt,
          })
          .from(schema.account)
          .where(eq(schema.account.userId, userId)),

        db
          .select({
            id: schema.session.id,
            createdAt: schema.session.createdAt,
            expiresAt: schema.session.expiresAt,
          })
          .from(schema.session)
          .where(eq(schema.session.userId, userId)),

        db
          .select({
            id: schema.member.id,
            organizationId: schema.member.organizationId,
            role: schema.member.role,
            createdAt: schema.member.createdAt,
          })
          .from(schema.member)
          .where(eq(schema.member.userId, userId)),

        db
          .select({
            id: schema.invitation.id,
            organizationId: schema.invitation.organizationId,
            email: schema.invitation.email,
            role: schema.invitation.role,
            status: schema.invitation.status,
            createdAt: schema.invitation.createdAt,
          })
          .from(schema.invitation)
          .where(eq(schema.invitation.inviterId, userId)),

        db
          .select({
            id: schema.auditLog.id,
            action: schema.auditLog.action,
            resource: schema.auditLog.resource,
            resourceId: schema.auditLog.resourceId,
            createdAt: schema.auditLog.createdAt,
          })
          .from(schema.auditLog)
          .where(eq(schema.auditLog.userId, userId))
          .orderBy(desc(schema.auditLog.createdAt))
          .limit(1000),
      ]);

      return { userResult, accounts, sessions, memberships, invitations, auditLogs };
    },
  );

  const exportData = {
    exportedAt: new Date().toISOString(),
    user: userResult[0],
    accounts,
    sessions,
    memberships,
    invitations,
    auditLogs,
    ...(auditLogs.length >= 1000 && { _warning: 'Audit logs truncated to 1000 entries. Contact support for full export.' }),
  };

  void logAuditEvent({
    userId,
    action: 'USER_DATA_EXPORT',
    resource: 'data_export',
    resourceId: userId,
    metadata: { type: 'rgpd_export' },
    ipAddress: extractIp(request.headers, clientAddress),
    userAgent: request.headers.get('user-agent'),
  });

  return new Response(JSON.stringify(exportData), {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="atomic-data-export.json"',
    },
  });
};
