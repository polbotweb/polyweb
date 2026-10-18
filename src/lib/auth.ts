import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getLazyDrizzle, getDrizzle, schema } from "@database/drizzle";
import { session as sessionTable } from "@database/schemas";
import { eq } from "drizzle-orm";
import { username, admin, organization, testUtils } from "better-auth/plugins";
import { ac, adminRole, editorRole, userRole, orgOwnerRole, orgAdminRole, orgMemberRole } from "@/lib/permissions";

const isTest = process.env.NODE_ENV === 'test';
import { type Locale, LOCALES, DEFAULT_LOCALE } from "@i18n/config";
import { verifyEmailTemplate } from "@smtp/templates/verify-email";
import { resetPasswordTemplate } from "@smtp/templates/reset-password";
import { deleteAccountTemplate } from "@smtp/templates/delete-account";
import { organizationInvitationTemplate } from "@smtp/templates/organization-invitation";
import { deleteUpload } from "@/media/delete";
import { logAuditEvent, extractIp, type AuditAction } from "@/lib/audit";

/** Extract locale from a callback URL like https://…/{locale}/auth/… */
function extractLocale(url: string): Locale {
  try {
    const { pathname } = new URL(url);
    const segment = pathname.split("/").filter(Boolean)[0];
    if (segment && (LOCALES as readonly string[]).includes(segment)) {
      return segment as Locale;
    }
  } catch { /* malformed url – fall through */ }
  return DEFAULT_LOCALE;
}

export const auth = betterAuth({
  database: drizzleAdapter(getLazyDrizzle(), {
    provider: "pg",
    schema,
  }),
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 10, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/forget-password": { window: 60, max: 3 },
      "/reset-password/*": { window: 60, max: 5 },
      "/change-password": { window: 60, max: 5 },
      "/delete-user/*": { window: 60, max: 2 },
      "/organization/create": { window: 60, max: 5 },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      const locale = extractLocale(url);
      const { subject, html, text } = resetPasswordTemplate({
        locale,
        userName: user.name,
        resetUrl: url,
      });
      if (!isTest) import("@smtp/send").then(m => m.sendEmail({ to: user.email, subject, html, text })).catch(err => {
        console.error('[SMTP] Reset password email failed:', err);
        void logAuditEvent({ action: 'EMAIL_SEND_FAILED', resource: 'email', metadata: { template: 'reset-password', to: user.email, error: String(err) } });
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      const locale = extractLocale(url);
      const { subject, html, text } = verifyEmailTemplate({
        locale,
        userName: user.name,
        verificationUrl: url,
      });
      if (!isTest) import("@smtp/send").then(m => m.sendEmail({ to: user.email, subject, html, text })).catch(err => {
        console.error('[SMTP] Verification email failed:', err);
        void logAuditEvent({ action: 'EMAIL_SEND_FAILED', resource: 'email', metadata: { template: 'verify-email', to: user.email, error: String(err) } });
      });
    },
  },
  user: {
    deleteUser: {
      enabled: true,
      sendDeleteAccountVerification: async ({ user, url }) => {
        const locale = extractLocale(url);
        const { subject, html, text } = deleteAccountTemplate({
          locale,
          userName: user.name,
          deleteUrl: url,
        });
        if (!isTest) import("@smtp/send").then(m => m.sendEmail({ to: user.email, subject, html, text })).catch(err => {
          console.error('[SMTP] Delete account email failed:', err);
          void logAuditEvent({ action: 'EMAIL_SEND_FAILED', resource: 'email', metadata: { template: 'delete-account', to: user.email, error: String(err) } });
        });
      },
      beforeDelete: async (user) => {
        if (user.image?.startsWith('/uploads/')) {
          try {
            await deleteUpload(user.image);
          } catch { /* file may already be gone */ }
        }
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      // Map better-auth paths to audit actions
      const pathActionMap: Record<string, { action: AuditAction; resource: string }> = {
        "/sign-in/email": { action: "SIGN_IN", resource: "session" },
        "/sign-up/email": { action: "SIGN_UP", resource: "user" },
        "/sign-out": { action: "SIGN_OUT", resource: "session" },
        "/change-password": { action: "PASSWORD_CHANGE", resource: "user" },
        "/forget-password": { action: "PASSWORD_RESET_REQUEST", resource: "user" },
        "/reset-password": { action: "PASSWORD_RESET_COMPLETE", resource: "user" },
        "/update-user": { action: "USER_UPDATE", resource: "user" },
        "/delete-user": { action: "USER_DELETE", resource: "user" },
        "/admin/ban-user": { action: "USER_BAN", resource: "user" },
        "/admin/unban-user": { action: "USER_UNBAN", resource: "user" },
        "/admin/set-role": { action: "USER_ROLE_CHANGE", resource: "user" },
        "/admin/impersonate-user": { action: "IMPERSONATION_START", resource: "session" },
        "/admin/stop-impersonating": { action: "IMPERSONATION_STOP", resource: "session" },
        "/admin/remove-user": { action: "USER_DELETE", resource: "user" },
        "/organization/create": { action: "ORG_CREATE", resource: "organization" },
        "/organization/update": { action: "ORG_UPDATE", resource: "organization" },
        "/organization/delete": { action: "ORG_DELETE", resource: "organization" },
        "/organization/invite-member": { action: "ORG_INVITATION_SEND", resource: "invitation" },
        "/organization/accept-invitation": { action: "ORG_INVITATION_ACCEPT", resource: "invitation" },
        "/organization/reject-invitation": { action: "ORG_INVITATION_REJECT", resource: "invitation" },
        "/organization/cancel-invitation": { action: "ORG_INVITATION_CANCEL", resource: "invitation" },
        "/organization/remove-member": { action: "ORG_MEMBER_REMOVE", resource: "member" },
        "/organization/update-member-role": { action: "ORG_MEMBER_ROLE_CHANGE", resource: "member" },
      };

      const mapping = pathActionMap[ctx.path];
      if (!mapping) return;

      // Log both successful and failed attempts for security visibility
      const returned = ctx.context.returned;
      const isFailed = returned instanceof Error
        || (returned && typeof returned === 'object' && 'status' in returned && (returned as { status: number }).status >= 400);

      // For failed auth attempts, log with limited info
      if (isFailed) {
        const failPaths = new Set(['/sign-in/email', '/sign-up/email', '/change-password', '/reset-password']);
        if (failPaths.has(ctx.path)) {
          const ip = ctx.headers ? extractIp(ctx.headers) : null;
          const ua = ctx.headers?.get('user-agent') ?? null;
          ctx.context.runInBackground(
            logAuditEvent({
              userId: null,
              action: (mapping.action + '_FAILED') as AuditAction,
              resource: mapping.resource,
              resourceId: null,
              metadata: { path: ctx.path },
              ipAddress: ip,
              userAgent: ua,
            }),
          );
        }
        return;
      }

      const userId = ctx.context.newSession?.user?.id
        ?? ctx.context.session?.user?.id
        ?? null;

      const ip = ctx.headers ? extractIp(ctx.headers) : null;
      const ua = ctx.headers?.get("user-agent") ?? null;

      // Build metadata from body — whitelist safe fields only (IDs and roles, no PII)
      const SAFE_FIELDS = new Set(['userId', 'organizationId', 'memberId', 'invitationId', 'role', 'slug']);
      const body: Record<string, string> = {};
      if (ctx.body) {
        for (const [key, value] of Object.entries(ctx.body)) {
          if (SAFE_FIELDS.has(key) && typeof value === 'string' && value.length <= 255) {
            body[key] = value;
          }
        }
      }

      ctx.context.runInBackground(
        logAuditEvent({
          userId,
          action: mapping.action,
          resource: mapping.resource,
          resourceId: (body.organizationId ?? body.memberId ?? body.invitationId ?? body.userId ?? null) as string | null,
          metadata: Object.keys(body).length > 0 ? body : null,
          ipAddress: ip,
          userAgent: ua,
        }),
      );

      // Revoke all sessions for the target user after ban or role change
      const SESSION_REVOKE_PATHS = new Set(['/admin/ban-user', '/admin/set-role']);
      if (SESSION_REVOKE_PATHS.has(ctx.path) && body.userId) {
        ctx.context.runInBackground(
          getDrizzle()
            .delete(sessionTable)
            .where(eq(sessionTable.userId, body.userId))
            .then(() => { /* sessions revoked */ })
            .catch((err) => console.error('[AUTH] Failed to revoke sessions after', ctx.path, err)),
        );
      }
    }),
  },
  plugins: [
    username(),
    admin({
      ac,
      roles: {
        admin: adminRole,
        editor: editorRole,
        user: userRole,
      },
    }),
    organization({
      ac,
      roles: {
        owner: orgOwnerRole,
        admin: orgAdminRole,
        member: orgMemberRole,
      },
      dynamicAccessControl: { enabled: true },
      async sendInvitationEmail(data) {
        const rawBaseUrl = process.env.BETTER_AUTH_URL;
        if (!rawBaseUrl) {
          throw new Error('[AUTH] BETTER_AUTH_URL is required — set it in your environment variables.');
        }
        let baseUrl: string;
        try {
          const parsed = new URL(rawBaseUrl);
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol');
          baseUrl = parsed.origin;
        } catch {
          throw new Error(`[AUTH] BETTER_AUTH_URL is invalid: "${rawBaseUrl}". Must be a valid http(s) URL.`);
        }
        const inviterLocale = (data.inviter.user as Record<string, unknown>).locale as Locale | undefined ?? DEFAULT_LOCALE;
        const inviteUrl = `${baseUrl}/${inviterLocale}/auth/${inviterLocale === 'fr' ? 'organisations' : 'organizations'}?org=${encodeURIComponent(data.organization.slug)}&invitation=${encodeURIComponent(data.id)}`;
        const { subject, html, text } = organizationInvitationTemplate({
          locale: inviterLocale,
          inviterName: data.inviter.user.name,
          orgName: data.organization.name,
          role: data.role ?? 'member',
          inviteUrl,
        });
        if (!isTest) import("@smtp/send").then(m => m.sendEmail({ to: data.email, subject, html, text })).catch(err => {
          console.error('[SMTP] Organization invitation email failed:', err);
          void logAuditEvent({ action: 'EMAIL_SEND_FAILED', resource: 'email', metadata: { template: 'org-invitation', to: data.email, error: String(err) } });
        });
      },
      organizationHooks: {
        beforeDeleteOrganization: async (data) => {
          const org = data.organization;
          if (org.logo?.startsWith('/uploads/')) {
            try {
              await deleteUpload(org.logo);
            } catch { /* file may already be gone */ }
          }
        },
      },
    }),
    ...(isTest ? [testUtils()] : []),
  ],
});
