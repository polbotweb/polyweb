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

/** Catégories de préférences (N5-A). Les modules en ajoutent via leurs définitions. */
export type NotificationCategory = "comments" | "reviews" | "publishing" | "mentions" | "billing" | "system" | (string & {});

const TYPE_CATEGORIES: Record<string, NotificationCategory> = {
  NEW_REVIEW: "reviews",
  REVIEW_APPROVED: "reviews",
  REVIEW_REJECTED: "reviews",
  POST_PUBLISHED: "publishing",
  SERVICE_PUBLISHED: "publishing",
  POST_MENTION: "mentions",
  SERVICE_MENTION: "mentions",
};

/** Catégorie par défaut d'un type historique (même table que la migration 0052). */
export function defaultNotificationCategory(type: string): NotificationCategory {
  return TYPE_CATEGORIES[type] ?? "comments";
}

export type NotificationRowInput = {
  readonly userId: string;
  readonly organizationId?: string | null;
  readonly module: string;
  readonly type: string;
  readonly category?: NotificationCategory;
  readonly actorId?: string | null;
  readonly resourceType?: string | null;
  readonly resourceId?: string | null;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly title?: string | null;
  readonly message?: string | null;
  readonly dedupeKey?: string | null;
};

/** Valeurs d'insertion dans `notifications` ; les clés `data` nulles/indéfinies sont retirées. */
export function notificationRow(input: NotificationRowInput) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.data ?? {})) if (value !== null && value !== undefined) data[key] = value;
  return {
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    module: input.module,
    type: input.type,
    category: input.category ?? defaultNotificationCategory(input.type),
    actorId: input.actorId ?? null,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    data,
    title: input.title ?? null,
    message: input.message ?? null,
    dedupeKey: input.dedupeKey ?? null,
  };
}
