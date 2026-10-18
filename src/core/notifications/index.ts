export type NotificationTarget = {
  readonly resourceId: string;
  readonly commentId?: string;
  readonly reviewId?: string;
};

export type NotificationContext = NotificationTarget & {
  readonly type: string;
};

export function assertNotificationContext(context: NotificationContext): void {
  if (!context.type.trim()) throw new Error("Notification type cannot be empty");
  if (!context.resourceId.trim()) throw new Error("Notification resourceId cannot be empty");
  if (context.commentId !== undefined && !context.commentId.trim()) throw new Error("Notification commentId cannot be empty");
  if (context.reviewId !== undefined && !context.reviewId.trim()) throw new Error("Notification reviewId cannot be empty");
  if (context.commentId !== undefined && context.reviewId !== undefined) throw new Error("Notification cannot target both comment and review");
}
