/**
 * File d'envoi des e-mails de notifications (N3-A). `enqueueEmail` est idempotent
 * (`dedupe_key` unique) et respecte la préférence e-mail de la catégorie ; le cron
 * `/api/cron/notifications` appelle `processEmailOutbox` : verrou par ligne, rendu du gabarit,
 * envoi, backoff exponentiel persistant, abandon (`failed`) après `EMAIL_OUTBOX_MAX_ATTEMPTS`.
 * Les e-mails d'authentification restent envoyés en direct (hors outbox).
 * Aucune PII dans les logs : `last_error` ne contient qu'un code d'erreur.
 */
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle, type DrizzleDB } from "@database/drizzle";
import { emailOutbox } from "@database/schemas/notifications.schema";
import { dbTry } from "@/lib/effect/run";
import type { DbError } from "@/lib/effect/errors";
import type { DbTransaction } from "@/lib/effect/transaction";
import { AppConfig } from "@/lib/effect/config";
import { sendEmailEffect } from "@/smtp/send";
import type { EmailPayload } from "@/smtp/types";
import { asLocale, renderNotificationEmail } from "./email-templates";
import { isChannelEnabled } from "./service";
import { signUnsubscribeToken } from "./unsubscribe";

type Executor = DrizzleDB | DbTransaction;

export const EMAIL_OUTBOX_MAX_ATTEMPTS = 6;
const LOCK_MS = 5 * 60_000;
const BASE_DELAY_MS = 60_000;

export interface EnqueueEmailInput {
  readonly dedupeKey: string;
  readonly userId?: string | null;
  readonly organizationId?: string | null;
  readonly toEmail: string;
  readonly locale: string;
  readonly template: string;
  readonly category: string;
  readonly data?: Record<string, unknown>;
  readonly notBefore?: Date;
}

/** Met un e-mail en file. Renvoie l'id créé, ou `null` (doublon ou préférence désactivée). */
export const enqueueEmail = (input: EnqueueEmailInput, executor: Executor = getDrizzle()): Effect.Effect<string | null, DbError> =>
  Effect.gen(function* () {
    if (input.userId && !(yield* isChannelEnabled(input.userId, input.category, "email", executor))) return null;
    const [row] = yield* dbTry("email_outbox.enqueue", () =>
      executor
        .insert(emailOutbox)
        .values({
          dedupeKey: input.dedupeKey,
          userId: input.userId ?? null,
          organizationId: input.organizationId ?? null,
          toEmail: input.toEmail,
          locale: asLocale(input.locale),
          template: input.template,
          category: input.category,
          data: input.data ?? {},
          ...(input.notBefore ? { nextAttemptAt: input.notBefore } : {}),
        })
        .onConflictDoNothing({ target: emailOutbox.dedupeKey })
        .returning({ id: emailOutbox.id }),
    );
    return row?.id ?? null;
  });

/** Délai avant la tentative n+1 (n = tentatives déjà faites ≥ 1) : 1, 2, 4, 8… min, plafonné à 6 h. */
export const emailRetryDelayMs = (attempts: number) => Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), 6 * 3_600_000);

export type EmailSender = (payload: EmailPayload) => Effect.Effect<void, { readonly _tag: string }>;
const defaultSender: EmailSender = (payload) => sendEmailEffect(payload);

type Outcome = "sent" | "retry" | "failed" | "skipped";

const errorCode = (error: { readonly _tag: string; readonly retryable?: boolean }) => error._tag.slice(0, 60);
const permanent = (tag: string) => tag === "InvalidEmailPayload" || tag === "UnknownEmailTemplate" || tag === "InvalidEmailTemplateData";

const deliverOne = (id: string, now: Date, send: EmailSender): Effect.Effect<Outcome, DbError, AppConfig> =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const [row] = yield* dbTry("email_outbox.claim", () =>
      db
        .update(emailOutbox)
        .set({ lockedUntil: new Date(now.getTime() + LOCK_MS), attempts: sql`${emailOutbox.attempts} + 1` })
        .where(and(eq(emailOutbox.id, id), eq(emailOutbox.status, "pending"), or(isNull(emailOutbox.lockedUntil), lte(emailOutbox.lockedUntil, now))))
        .returning(),
    );
    if (!row) return "skipped";
    // Préférence relue à l'envoi : une désinscription entre la mise en file et l'envoi est respectée.
    if (row.userId && !(yield* isChannelEnabled(row.userId, row.category, "email"))) {
      yield* dbTry("email_outbox.cancel", () => db.update(emailOutbox).set({ status: "cancelled", lockedUntil: null }).where(eq(emailOutbox.id, id)));
      return "skipped";
    }
    const config = yield* AppConfig;
    const locale = asLocale(row.locale);
    const unsubscribeUrl = row.userId
      ? `${config.siteUrl}/${locale}/notifications/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken({ userId: row.userId, category: row.category, channel: "email" }, config.signingSecret, now.getTime()))}`
      : undefined;
    const result = yield* renderNotificationEmail(row.template, row.data, { locale, siteUrl: config.siteUrl, unsubscribeUrl }).pipe(
      Effect.flatMap((email) =>
        send({
          to: row.toEmail,
          ...email,
          ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
        }),
      ),
      Effect.result,
    );
    if (result._tag === "Success") {
      yield* dbTry("email_outbox.sent", () =>
        db.update(emailOutbox).set({ status: "sent", sentAt: new Date(), lockedUntil: null, lastError: null }).where(eq(emailOutbox.id, id)),
      );
      return "sent";
    }
    const tag = errorCode(result.failure);
    const giveUp = permanent(tag) || row.attempts >= EMAIL_OUTBOX_MAX_ATTEMPTS;
    yield* dbTry("email_outbox.failed", () =>
      db
        .update(emailOutbox)
        .set(
          giveUp
            ? { status: "failed", lockedUntil: null, lastError: tag }
            : { lockedUntil: null, lastError: tag, nextAttemptAt: new Date(now.getTime() + emailRetryDelayMs(row.attempts)) },
        )
        .where(eq(emailOutbox.id, id)),
    );
    yield* Effect.logWarning("[notifications] email delivery failed", { template: row.template, attempts: row.attempts, error: tag });
    return giveUp ? "failed" : "retry";
  });

/** Traite les e-mails dus (cron). Renvoie le décompte par issue. */
export interface ProcessEmailOutboxOptions {
  readonly limit?: number;
  readonly now?: Date;
  readonly send?: EmailSender;
  /** Restreint le traitement à ces lignes (reprise ciblée, tests isolés). */
  readonly ids?: readonly string[];
}

export const processEmailOutbox = ({ limit = 50, now = new Date(), send = defaultSender, ids }: ProcessEmailOutboxOptions = {}) =>
  Effect.gen(function* () {
    const due = yield* dbTry("email_outbox.due", () =>
      getDrizzle()
        .select({ id: emailOutbox.id })
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.status, "pending"),
            lte(emailOutbox.nextAttemptAt, now),
            or(isNull(emailOutbox.lockedUntil), lte(emailOutbox.lockedUntil, now)),
            ids ? inArray(emailOutbox.id, ids.length > 0 ? [...ids] : [""]) : undefined,
          ),
        )
        .orderBy(emailOutbox.nextAttemptAt)
        .limit(Math.min(200, Math.max(1, limit))),
    );
    const outcomes = yield* Effect.forEach(due, (r) => deliverOne(r.id, now, send), { concurrency: 4 });
    const tally = { sent: 0, retry: 0, failed: 0, skipped: 0 };
    for (const o of outcomes) tally[o]++;
    return tally;
  }).pipe(Effect.withSpan("notifications.email_outbox.process"));

/** Annule les e-mails encore en attente d'une ou plusieurs clés (ex. facture payée entre-temps). */
export const cancelPendingEmails = (dedupeKeys: readonly string[], executor: Executor = getDrizzle()) =>
  dedupeKeys.length === 0
    ? Effect.succeed(0)
    : dbTry("email_outbox.cancel_keys", () =>
        executor
          .update(emailOutbox)
          .set({ status: "cancelled", lockedUntil: null })
          .where(and(eq(emailOutbox.status, "pending"), inArray(emailOutbox.dedupeKey, [...dedupeKeys])))
          .returning({ id: emailOutbox.id }),
      ).pipe(Effect.map((rows) => rows.length));
