import { defineAction } from "astro:actions";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { user } from "@database/schemas";
import { userProfileSchema } from "@/lib/blog/validation";
import { sanitizeHtml } from "@/lib/sanitize";
import { logAuditEventEffect, extractIp } from "@/lib/audit";
import { actionTry, effectHandler, fail } from "@/lib/effect/action";

/**
 * Updates the current user's public profile (bio + social links).
 * Used by the blog author page. Auth required; a user can only edit their own
 * profile (no `userId` input — we use the session user).
 */
export const updateUserProfile = defineAction({
  input: userProfileSchema,
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const currentUser = context.locals.user;
    if (!currentUser) return yield* fail("UNAUTHORIZED", "Vous devez être connecté.");

    // Normalize social handles: strip leading @ and any URL prefix.
    const normalizeHandle = (value: string | undefined): string | null => {
      const v = value?.trim();
      if (!v) return null;
      return v.replace(/^@/, "").replace(/^https?:\/\/(twitter\.com|x\.com|linkedin\.com\/in)\//, "");
    };

    yield* actionTry("blog/profile.update", () =>
      getDrizzle()
        .update(user)
        .set({
          bio: input.bio ? sanitizeHtml(input.bio) : null,
          website: input.website ? input.website.trim() : null,
          twitter: normalizeHandle(input.twitter),
          linkedin: normalizeHandle(input.linkedin),
          updatedAt: new Date(),
        })
        .where(eq(user.id, currentUser.id)),
    );

    // Journal d'audit non bloquant (ne fait jamais échouer la mise à jour du profil).
    yield* Effect.forkDetach(
      logAuditEventEffect({
        userId: currentUser.id,
        action: "USER_PROFILE_UPDATE",
        resource: "user",
        resourceId: currentUser.id,
        metadata: { fields: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined) },
        ipAddress: extractIp(context.request.headers, context.clientAddress),
        userAgent: context.request.headers.get("user-agent"),
      }),
    );

    return { success: true };
  }).pipe(Effect.withSpan("action blog/profile.updateUserProfile"))),
});
