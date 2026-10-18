import { defineAction, ActionError } from "astro:actions";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { user } from "@database/schemas";
import { userProfileSchema } from "@/lib/blog/validation";
import { sanitizeHtml } from "@/lib/sanitize";
import { logAuditEvent, extractIp } from "@/lib/audit";

/**
 * Updates the current user's public profile (bio + social links).
 * Used by the blog author page. Auth required; a user can only edit their own
 * profile (no `userId` input — we use the session user).
 */
export const updateUserProfile = defineAction({
  input: userProfileSchema,
  handler: async (input, context) => {
    const currentUser = context.locals.user;
    if (!currentUser) {
      throw new ActionError({ code: "UNAUTHORIZED", message: "Vous devez être connecté." });
    }

    const db = getDrizzle();

    const twitter = input.twitter?.trim() || null;
    const linkedin = input.linkedin?.trim() || null;
    // Normalize social handles: strip leading @ and any URL prefix.
    const normalizeHandle = (value: string | null): string | null => {
      if (!value) return null;
      return value.replace(/^@/, "").replace(/^https?:\/\/(twitter\.com|x\.com|linkedin\.com\/in)\//, "");
    };

    await db
      .update(user)
      .set({
        bio: input.bio ? sanitizeHtml(input.bio) : null,
        website: input.website ? input.website.trim() : null,
        twitter: normalizeHandle(twitter),
        linkedin: normalizeHandle(linkedin),
        updatedAt: new Date(),
      })
      .where(eq(user.id, currentUser.id));

    void logAuditEvent({
      userId: currentUser.id,
      action: "USER_PROFILE_UPDATE",
      resource: "user",
      resourceId: currentUser.id,
      metadata: { fields: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined) },
      ipAddress: extractIp(context.request.headers, context.clientAddress),
      userAgent: context.request.headers.get("user-agent"),
    }).catch(() => {});

    return { success: true };
  },
});
