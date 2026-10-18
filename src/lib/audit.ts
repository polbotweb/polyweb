import { getDrizzle } from "@database/drizzle";
import { auditLog } from "@database/schemas";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { isIP } from "node:net";

export type AuditAction =
  | "SIGN_IN" | "SIGN_IN_FAILED" | "SIGN_UP" | "SIGN_UP_FAILED" | "SIGN_OUT"
  | "PASSWORD_CHANGE" | "PASSWORD_CHANGE_FAILED" | "PASSWORD_RESET_REQUEST" | "PASSWORD_RESET_COMPLETE" | "PASSWORD_RESET_COMPLETE_FAILED"
  | "USER_UPDATE" | "USER_DELETE" | "USER_BAN" | "USER_UNBAN" | "USER_ROLE_CHANGE" | "IMPERSONATION_START" | "IMPERSONATION_STOP"
  | "ORG_CREATE" | "ORG_UPDATE" | "ORG_DELETE" | "ORG_MEMBER_ADD" | "ORG_MEMBER_REMOVE" | "ORG_MEMBER_ROLE_CHANGE" | "ORG_INVITATION_SEND" | "ORG_INVITATION_ACCEPT" | "ORG_INVITATION_REJECT" | "ORG_INVITATION_CANCEL"
  | "FILE_UPLOAD" | "FILE_DELETE" | "SITE_SETTINGS_UPDATE" | "SOCIAL_LINK_CREATE" | "SOCIAL_LINK_UPDATE" | "SOCIAL_LINK_DELETE" | "SOCIAL_LINK_REORDER" | "CONTACT_INFO_UPDATE" | "OPENING_HOURS_UPDATE"
  | "NAVIGATION_MENU_CREATE" | "NAVIGATION_MENU_UPDATE" | "NAVIGATION_MENU_DELETE" | "NAVIGATION_ITEM_CREATE" | "NAVIGATION_ITEM_UPDATE" | "NAVIGATION_ITEM_DELETE"
  | "PAGE_CREATE" | "PAGE_UPDATE" | "PAGE_DELETE" | "PAGE_PUBLISH" | "PAGE_PREVIEW" | "PAGE_SECTION_CREATE" | "PAGE_SECTION_UPDATE" | "PAGE_SECTION_DELETE" | "PAGE_SECTION_REORDER"
  | "THEME_UPDATE" | "THEME_CREATE" | "THEME_DELETE" | "CONSENT_SETTINGS_UPDATE"
  | "MEDIA_FOLDER_CREATE" | "MEDIA_FOLDER_UPDATE" | "MEDIA_FOLDER_DELETE" | "MEDIA_FILE_UPLOAD" | "MEDIA_FILE_RENAME" | "MEDIA_FILE_MOVE" | "MEDIA_FILE_DELETE" | "MEDIA_FILE_ALT_UPDATE" | "MEDIA_FILE_ALT_DELETE"
  | "PAGE_VERSION_CREATE" | "PAGE_VERSION_RESTORE" | "PAGE_SCHEDULE" | "PAGE_UNSCHEDULE" | "PAGE_RESTORE" | "PAGE_PERMANENT_DELETE" | "PAGES_BULK_PUBLISH" | "PAGES_BULK_ARCHIVE" | "PAGE_SCHEDULE_UNPUBLISH" | "PAGE_UNSCHEDULE_UNPUBLISH" | "PAGE_CLONE" | "PAGE_LOCK" | "PAGE_UNLOCK" | "PAGE_SUBMIT_FOR_REVIEW" | "PAGE_APPROVE" | "PAGE_REJECT" | "PAGE_COMMENT_CREATE" | "PAGE_COMMENT_DELETE" | "PAGES_BULK_DELETE" | "PAGES_BULK_RESTORE"
  | "CONTENT_EXPORT" | "CONTENT_IMPORT" | "WEBHOOK_CREATE" | "WEBHOOK_UPDATE" | "WEBHOOK_DELETE" | "USER_DATA_EXPORT" | "CONTACT_FORM_SUBMIT" | "EMAIL_SEND_FAILED" | "AUDIT_LOG_ACCESS"
  | "ORG_ROLE_CREATE" | "ORG_ROLE_UPDATE" | "ORG_ROLE_DELETE" | "ORG_MEMBER_ROLE_UPDATE"
  | "BLOG_POST_CREATE" | "BLOG_POST_UPDATE" | "BLOG_POST_DELETE" | "BLOG_POST_ARCHIVE" | "BLOG_POST_PUBLISH" | "BLOG_POST_UNPUBLISH" | "BLOG_POST_RESTORE"
  | "BLOG_CATEGORY_CREATE" | "BLOG_CATEGORY_UPDATE" | "BLOG_CATEGORY_DELETE" | "BLOG_TAG_CREATE" | "BLOG_TAG_UPDATE" | "BLOG_TAG_DELETE"
  | "BLOG_COMMENT_MODERATE" | "BLOG_REVIEW_MODERATE" | "BLOG_REPORT_RESOLVE" | "BLOG_LINK_CREATE" | "BLOG_LINK_UPDATE" | "BLOG_LINK_DELETE"
  | "BLOG_GALLERY_CREATE" | "BLOG_GALLERY_UPDATE" | "BLOG_GALLERY_DELETE" | "BLOG_GALLERY_MEDIA_ADD" | "BLOG_GALLERY_MEDIA_REMOVE"
  | "BLOG_NEWSLETTER_SUBSCRIBE" | "BLOG_NEWSLETTER_CONFIRM" | "BLOG_NEWSLETTER_UNSUBSCRIBE" | "BLOG_LINK_CHECK" | "BLOG_REACTION_ADD" | "BLOG_REACTION_REMOVE" | "BLOG_FAVORITE_ADD" | "BLOG_FAVORITE_REMOVE" | "BLOG_POST_VIEW"
  | "SERVICE_CREATE" | "SERVICE_UPDATE" | "SERVICE_DELETE" | "SERVICE_ARCHIVE" | "SERVICE_PUBLISH" | "SERVICE_UNPUBLISH" | "SERVICE_RESTORE" | "SERVICE_DUPLICATE" | "SERVICE_LOCK" | "SERVICE_UNLOCK" | "SERVICE_REVISION_RESTORE" | "SERVICE_CATEGORY_CREATE" | "SERVICE_CATEGORY_UPDATE" | "SERVICE_CATEGORY_DELETE" | "SERVICE_TAG_CREATE" | "SERVICE_TAG_UPDATE" | "SERVICE_TAG_DELETE" | "SERVICE_COMMENT_CREATE" | "SERVICE_COMMENT_MODERATE" | "SERVICE_REVIEW_CREATE" | "SERVICE_REVIEW_MODERATE" | "SERVICE_REVIEW_HELPFUL" | "SERVICE_REPORT_CREATE" | "SERVICE_REPORT_RESOLVE" | "SERVICE_FAVORITE_ADD" | "SERVICE_FAVORITE_REMOVE" | "SERVICE_VIEW" | "SERVICE_REACTION_ADD" | "SERVICE_REACTION_REMOVE"
  | "USER_PROFILE_UPDATE";

export interface AuditEventInput { userId?: string | null; action: AuditAction; resource?: string | null; resourceId?: string | null; metadata?: Record<string, unknown> | null; ipAddress?: string | null; userAgent?: string | null; }
const MAX_METADATA_SIZE = 10 * 1024;
function safeMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> | null { if (!metadata) return null; const json = JSON.stringify(metadata); return json.length <= MAX_METADATA_SIZE ? metadata : { _truncated: true, _originalSize: json.length, action: metadata.action ?? null }; }

export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const db = getDrizzle();
    await db.insert(auditLog).values({ userId: input.userId ?? null, action: input.action, resource: input.resource ?? null, resourceId: input.resourceId ?? null, metadata: safeMetadata(input.metadata), ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null });
  } catch (err) {
    console.error("[audit] Failed to log event:", err);
    const date = new Date().toISOString().slice(0, 10);
    const logsDir = join(process.cwd(), "logs");
    const fallbackPath = join(logsDir, `audit-fallback-${date}.jsonl`);
    const record = JSON.stringify({ timestamp: new Date().toISOString(), ...input });
    mkdir(logsDir, { recursive: true, mode: 0o700 }).then(() => appendFile(fallbackPath, record + "\n", { mode: 0o600 })).catch((fileErr) => console.error("[audit] Fallback file write also failed:", fileErr));
  }
}

export function extractIp(headers: Headers, clientAddress?: string | null): string | null {
  const trustProxy = process.env.TRUST_PROXY === "true";
  if (trustProxy) {
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) { const ip = forwarded.split(",")[0].trim(); if (isValidIp(ip)) return ip; }
    const realIp = headers.get("x-real-ip");
    if (realIp && isValidIp(realIp)) return realIp;
  }
  if (clientAddress && isValidIp(clientAddress)) return clientAddress;
  return null;
}
function isValidIp(ip: string): boolean { return isIP(ip) !== 0; }
