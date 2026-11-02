/**
 * Service de notifications (N1-A / N2-A / N5-A) : création idempotente (clé de déduplication),
 * respect des préférences catégorie × canal, lecture, marquage lu. Aucune PII dans les logs :
 * seuls module, type et nombre de lignes sont journalisés.
 */
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle, type DrizzleDB } from "@database/drizzle";
import { notificationPreferences, notifications } from "@database/schemas/notifications.schema";
import { dbTry } from "@/lib/effect/run";
import type { DbError } from "@/lib/effect/errors";
import type { DbTransaction } from "@/lib/effect/transaction";
import { notificationRow, type NotificationRowInput } from "./index";
import type { NotificationChannel } from "./registry";

type Executor = DrizzleDB | DbTransaction;

/** Préférence effective : activé par défaut, sauf ligne explicite `enabled = false`. */
export const isChannelEnabled = (
  userId: string,
  category: string,
  channel: NotificationChannel,
  executor: Executor = getDrizzle(),
): Effect.Effect<boolean, DbError> =>
  dbTry("notifications.preference", () =>
    executor
      .select({ enabled: notificationPreferences.enabled })
      .from(notificationPreferences)
      .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.category, category), eq(notificationPreferences.channel, channel)))
      .limit(1),
  ).pipe(Effect.map(([row]) => row?.enabled ?? true));

/**
 * Crée une notification in-app si la préférence l'autorise. Idempotent par `dedupeKey`
 * (une relivraison d'événement ne crée pas de doublon). Renvoie l'id créé ou `null`.
 */
export const notify = (input: NotificationRowInput, executor: Executor = getDrizzle()): Effect.Effect<string | null, DbError> =>
  Effect.gen(function* () {
    const row = notificationRow(input);
    if (!(yield* isChannelEnabled(row.userId, row.category, "in_app", executor))) return null;
    const [created] = yield* dbTry("notifications.insert", () =>
      executor.insert(notifications).values(row).onConflictDoNothing({ target: notifications.dedupeKey }).returning({ id: notifications.id }),
    );
    return created?.id ?? null;
  }).pipe(Effect.withSpan("notifications.notify", { attributes: { "notification.module": input.module, "notification.type": input.type } }));

export interface NotificationScope {
  readonly userId: string;
  /** `undefined` = toutes organisations ; `null` = plateforme. */
  readonly organizationId?: string | null;
  readonly module?: string;
}

const scopeWhere = (scope: NotificationScope) =>
  and(
    eq(notifications.userId, scope.userId),
    scope.module ? eq(notifications.module, scope.module) : undefined,
    scope.organizationId === undefined ? undefined : scope.organizationId === null ? isNull(notifications.organizationId) : eq(notifications.organizationId, scope.organizationId),
  );

export const listNotifications = (scope: NotificationScope, opts: { page?: number; limit?: number; unreadOnly?: boolean } = {}) => {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = (Math.max(1, opts.page ?? 1) - 1) * limit;
  return dbTry("notifications.list", () =>
    getDrizzle()
      .select()
      .from(notifications)
      .where(and(scopeWhere(scope), opts.unreadOnly ? isNull(notifications.readAt) : undefined))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit)
      .offset(offset),
  );
};

export const unreadNotificationCount = (scope: NotificationScope) =>
  dbTry("notifications.unread", () =>
    getDrizzle().select({ value: count() }).from(notifications).where(and(scopeWhere(scope), isNull(notifications.readAt))),
  ).pipe(Effect.map(([row]) => Number(row?.value ?? 0)));

/** Marque lues des notifications du destinataire (toutes si `ids` absent) ; conserve la 1re date de lecture. */
export const markNotificationsRead = (scope: NotificationScope, ids?: readonly string[]) =>
  dbTry("notifications.markRead", () =>
    getDrizzle()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(scopeWhere(scope), isNull(notifications.readAt), ids ? inArray(notifications.id, [...ids]) : undefined))
      .returning({ id: notifications.id }),
  ).pipe(Effect.map((rows) => rows.length));

/** Enregistre une préférence (upsert). */
export const setNotificationPreference = (userId: string, category: string, channel: NotificationChannel, enabled: boolean) =>
  dbTry("notifications.preference.set", () =>
    getDrizzle()
      .insert(notificationPreferences)
      .values({ userId, category, channel, enabled, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [notificationPreferences.userId, notificationPreferences.category, notificationPreferences.channel], set: { enabled, updatedAt: new Date() } }),
  ).pipe(Effect.asVoid);

export const listNotificationPreferences = (userId: string) =>
  dbTry("notifications.preference.list", () =>
    getDrizzle().select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)),
  );
