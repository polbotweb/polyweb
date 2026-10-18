import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogNotifications } from "@database/schemas";
import { blogOrganizationIdSchema } from "./_helpers";

function notificationOrganizationScope(organizationId: string | null | undefined) {
  if (organizationId === undefined) return undefined;
  return organizationId === null
    ? isNull(blogNotifications.organizationId)
    : eq(blogNotifications.organizationId, organizationId);
}

/** Marks a single notification as read. Scoped to the requesting user — cannot mark another user's notification. */
export const markBlogNotificationRead = defineAction({
  input: z.object({
    id: z.uuid(),
    organizationId: blogOrganizationIdSchema,
  }),
  handler: async (input, context) => {
    const user = context.locals.user;
    if (!user) throw new ActionError({ code: "UNAUTHORIZED", message: "Connexion requise." });

    const db = getDrizzle();
    await db
      .update(blogNotifications)
      .set({ isRead: true })
      .where(
        and(
          eq(blogNotifications.id, input.id),
          eq(blogNotifications.userId, user.id),
          notificationOrganizationScope(input.organizationId),
        ),
      );

    return { success: true };
  },
});

/** Marks every unread notification belonging to the requesting user as read. */
export const markAllBlogNotificationsRead = defineAction({
  input: z.object({
    organizationId: blogOrganizationIdSchema,
  }),
  handler: async (input, context) => {
    const user = context.locals.user;
    if (!user) throw new ActionError({ code: "UNAUTHORIZED", message: "Connexion requise." });

    const db = getDrizzle();
    await db
      .update(blogNotifications)
      .set({ isRead: true })
      .where(
        and(
          eq(blogNotifications.userId, user.id),
          eq(blogNotifications.isRead, false),
          notificationOrganizationScope(input.organizationId),
        ),
      );

    return { success: true };
  },
});
