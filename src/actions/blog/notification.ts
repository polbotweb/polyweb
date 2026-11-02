import { Effect } from "effect";
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { notifications } from "@database/schemas";
import { blogOrganizationIdSchema } from "./_helpers";
import { actionTry, effectHandler, requireUser } from "@/lib/effect/action";

function notificationOrganizationScope(organizationId: string | null | undefined) {
  if (organizationId === undefined) return undefined;
  return organizationId === null
    ? isNull(notifications.organizationId)
    : eq(notifications.organizationId, organizationId);
}

/** Marks a single notification as read. Scoped to the requesting user — cannot mark another user's notification. */
export const markBlogNotificationRead = defineAction({
  input: z.object({
    id: z.uuid(),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireUser(context, "Connexion requise.");
    return yield* actionTry("blog/notification.markBlogNotificationRead", async () => {

    const db = getDrizzle();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, input.id),
          eq(notifications.module, "blog"),
          eq(notifications.userId, user.id),
          notificationOrganizationScope(input.organizationId),
        ),
      );

    return { success: true };
    });
  })),
});

/** Marks every unread notification belonging to the requesting user as read. */
export const markAllBlogNotificationsRead = defineAction({
  input: z.object({
    organizationId: blogOrganizationIdSchema,
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireUser(context, "Connexion requise.");
    return yield* actionTry("blog/notification.markAllBlogNotificationsRead", async () => {

    const db = getDrizzle();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, user.id),
          eq(notifications.module, "blog"),
          isNull(notifications.readAt),
          notificationOrganizationScope(input.organizationId),
        ),
      );

    return { success: true };
    });
  })),
});
