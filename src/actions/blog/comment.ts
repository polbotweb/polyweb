import { assertBlogPermission, resolveBlogTenant, auditBlog, blogOrganizationIdSchema, blogPublicRateLimit, invalidateBlogCache } from "./_helpers";
import { defineAction, ActionError } from "astro:actions";
import { eq, and, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogComments, blogCommentModerations, blogPosts, blogNotifications } from "@database/schemas";
import { sanitizeHtml } from "@/lib/sanitize";
import { blogCommentFormSchema, blogCommentModerationSchema } from "@/lib/blog/validation";
import { publicBlogPostScope } from "@/lib/blog/public-visibility";
import { extractIp } from "@/lib/audit";

// Public loaders render roots plus one reply level; reject deeper trees so no
// accepted comment becomes unreachable in the public thread.
const MAX_COMMENT_REPLY_DEPTH = 1;

export const createBlogComment = defineAction({
  input: blogCommentFormSchema,
  handler: async (input, context) => {
    blogPublicRateLimit(context, "comment-create", { window: 300, max: 5 });
    const db = getDrizzle();
    const [post] = await db
      .select({ id: blogPosts.id, commentStatus: blogPosts.commentStatus, organizationId: blogPosts.organizationId })
      .from(blogPosts)
      .where(and(eq(blogPosts.id, input.postId), publicBlogPostScope(blogPosts)))
      .limit(1);

    if (!post) throw new ActionError({ code: "NOT_FOUND", message: "Article introuvable." });
    if (post.commentStatus === "DISABLED" || post.commentStatus === "CLOSED") {
      throw new ActionError({ code: "FORBIDDEN", message: "Les commentaires sont désactivés pour cet article." });
    }

    const user = context.locals.user;
    const content = sanitizeHtml(input.content);
    // Guest identity fields are rendered in the UI (moderation queue, author
    // label) and must be stripped of any markup — sanitizeHtml escapes tags.
    const guestName = input.guestName ? sanitizeHtml(input.guestName) : undefined;
    const guestEmail = input.guestEmail ? sanitizeHtml(input.guestEmail) : undefined;

    if (input.parentId) {
      let ancestorId: string | null | undefined = input.parentId;
      let replyDepth = 0;

      while (ancestorId) {
        const [ancestor] = await db
          .select({ parentId: blogComments.parentId })
          .from(blogComments)
          .where(
            and(
              eq(blogComments.id, ancestorId),
              eq(blogComments.postId, input.postId),
              eq(blogComments.status, "APPROVED"),
            ),
          )
          .limit(1);

        if (!ancestor) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Le commentaire parent n'appartient pas à cet article ou n'est pas public.",
          });
        }

        replyDepth += 1;
        if (replyDepth > MAX_COMMENT_REPLY_DEPTH) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "La profondeur maximale des réponses est atteinte.",
          });
        }
        ancestorId = ancestor.parentId;
      }
    }

    const [comment] = await db
      .insert(blogComments)
      .values({
        postId: input.postId,
        authorId: user?.id ?? null,
        parentId: input.parentId,
        guestName: user ? null : guestName,
        guestEmail: user ? null : guestEmail,
        content,
        status: "PENDING",
        ipAddress: extractIp(context.request.headers, context.clientAddress),
        userAgent: context.request.headers.get("user-agent"),
      })
      .returning();

    // A PENDING comment is not yet public, so it must NOT invalidate the public
    // blog cache (that would thrash the whole listing on every submission), and
    // it must NOT notify the author yet — the author would receive a link to a
    // comment that is not visible until approved. Notification is sent on
    // approval in moderateBlogComment.
    return { id: comment.id, status: comment.status };
  },
});

export const moderateBlogComment = defineAction({
  input: blogCommentModerationSchema.extend({
    organizationId: blogOrganizationIdSchema,
  }),
  handler: async (input, context) => {
    const tenant = resolveBlogTenant(input);
    const user = await assertBlogPermission(context, tenant, { blogComment: ["moderate"] });

    const db = getDrizzle();
    const { newStatus } = await db.transaction(async (tx) => {
      const [comment] = await tx
        .select({
          id: blogComments.id,
          postId: blogComments.postId,
          parentId: blogComments.parentId,
          authorId: blogComments.authorId,
          content: blogComments.content,
          status: blogComments.status,
          postAuthorId: blogPosts.authorId,
          organizationId: blogPosts.organizationId,
        })
        .from(blogComments)
        .innerJoin(blogPosts, eq(blogComments.postId, blogPosts.id))
        .where(
          and(
            eq(blogComments.id, input.commentId),
            tenant.organizationId === null
              ? isNull(blogPosts.organizationId)
              : eq(blogPosts.organizationId, tenant.organizationId),
          ),
        )
        .limit(1);

      if (!comment) throw new ActionError({ code: "NOT_FOUND", message: "Commentaire introuvable." });

      const newStatus =
        input.moderationAction === "APPROVE"
          ? "APPROVED"
          : input.moderationAction === "REJECT"
            ? "REJECTED"
            : input.moderationAction === "DELETE"
              ? "TRASH"
              : input.moderationAction === "RESTORE"
                ? "PENDING"
                : comment.status;

      const newContent = input.moderationAction === "EDIT" && input.content
        ? sanitizeHtml(input.content)
        : comment.content;
      const becameApproved = newStatus === "APPROVED" && comment.status !== "APPROVED";
      const becameRejected = newStatus === "REJECTED" && comment.status !== "REJECTED";

      await tx
        .update(blogComments)
        .set({
          status: newStatus,
          content: newContent,
          isEdited: input.moderationAction === "EDIT",
        })
        .where(eq(blogComments.id, input.commentId));

      await tx.insert(blogCommentModerations).values({
        commentId: input.commentId,
        moderatorId: user.id,
        action: input.moderationAction,
        reason: input.reason,
        previousValues: { status: comment.status, content: comment.content },
      });

      if (comment.authorId && comment.authorId !== user.id) {
        if (becameApproved) {
          await tx.insert(blogNotifications).values({
            userId: comment.authorId,
            organizationId: comment.organizationId,
            type: "COMMENT_APPROVED",
            commentId: comment.id,
            fromUserId: user.id,
            metadata: { content: newContent.slice(0, 200) },
          });
        } else if (becameRejected) {
          await tx.insert(blogNotifications).values({
            userId: comment.authorId,
            organizationId: comment.organizationId,
            type: "COMMENT_REJECTED",
            commentId: comment.id,
            fromUserId: user.id,
          });
        }
      }

      if (becameApproved) {
        let recipientId = comment.postAuthorId;
        let notificationType: "NEW_COMMENT" | "REPLY_TO_COMMENT" = "NEW_COMMENT";

        if (comment.parentId) {
          const [parent] = await tx
            .select({ authorId: blogComments.authorId })
            .from(blogComments)
            .where(
              and(
                eq(blogComments.id, comment.parentId),
                eq(blogComments.postId, comment.postId),
              ),
            )
            .limit(1);
          recipientId = parent?.authorId ?? comment.postAuthorId;
          notificationType = "REPLY_TO_COMMENT";
        }

        if (recipientId && recipientId !== user.id && recipientId !== comment.authorId) {
          await tx.insert(blogNotifications).values({
            userId: recipientId,
            organizationId: comment.organizationId,
            type: notificationType,
            postId: comment.postId,
            commentId: comment.id,
            fromUserId: comment.authorId,
            metadata: { content: newContent.slice(0, 200) },
          });
        }
      }

      return { newStatus };
    });

    auditBlog(context, user.id, "BLOG_COMMENT_MODERATE", {
      resource: "blog_comments",
      resourceId: input.commentId,
      metadata: { action: input.moderationAction, newStatus },
    });

    invalidateBlogCache();
    return { success: true };
  },
});
