/**
 * Notifications banking : destinataires = membres de l'organisation dont le rôle figure dans les
 * réglages (`notifyRoles`), ou administrateurs plateforme pour le tenant plateforme. Chaque type est
 * activable par organisation ; les préférences utilisateur sont appliquées par `notify`.
 */
import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { member, user } from "@database/schemas/auth.schema";
import { notify } from "@/core/notifications/service";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import type { BankingNotificationKind } from "../domain/constants";
import type { BankingSettings } from "../domain/settings";
import { BANKING_NOTIFICATION_TYPES } from "../notifications/definitions";

export const bankingRecipients = (tx: DbTransaction, organizationId: string | null, roles: readonly string[]) =>
  organizationId === null
    ? dbTry("banking.notify.admins", () => tx.select({ id: user.id }).from(user).where(eq(user.role, "admin"))).pipe(Effect.map((rows) => rows.map((row) => row.id)))
    : roles.length === 0
      ? Effect.succeed([] as string[])
      : dbTry("banking.notify.members", () => tx.select({ id: member.userId }).from(member)
        .where(and(eq(member.organizationId, organizationId), inArray(member.role, [...roles])))).pipe(Effect.map((rows) => [...new Set(rows.map((row) => row.id))]));

export const notifyBanking = (tx: DbTransaction, input: {
  readonly organizationId: string | null;
  readonly settings: Pick<BankingSettings, "notifications" | "notifyRoles">;
  readonly kind: BankingNotificationKind;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly data: Record<string, unknown>;
  /** Clé de déduplication (suffixée par l'utilisateur). */
  readonly dedupeKey: string;
  readonly actorId?: string | null;
  /** Destinataires imposés (ex. approbateurs) ; sinon rôles des réglages. */
  readonly userIds?: readonly string[];
}) =>
  Effect.gen(function* () {
    if (!input.settings.notifications[input.kind]) return 0;
    const recipients = input.userIds ?? (yield* bankingRecipients(tx, input.organizationId, input.settings.notifyRoles));
    let sent = 0;
    for (const userId of recipients) {
      if (input.actorId && userId === input.actorId) continue;
      const id = yield* notify({
        userId, organizationId: input.organizationId, module: "banking", type: BANKING_NOTIFICATION_TYPES[input.kind], category: "banking",
        actorId: input.actorId ?? null, resourceType: input.resourceType, resourceId: input.resourceId, data: input.data, dedupeKey: `${input.dedupeKey}:${userId}`,
      }, tx);
      if (id) sent += 1;
    }
    return sent;
  });
