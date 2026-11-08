/**
 * Source de relances `sales.invoices` (N6-A) : pour chaque facture ouverte échue, enregistre le
 * niveau de relance dû (J+7, J+15, J+30 — unique par facture et niveau) et, dans la MÊME
 * transaction, met en file l'e-mail client (`email_outbox`, clé `sales.reminder:<id>:<niveau>`)
 * et notifie in-app l'auteur de la facture. Rejouable sans doublon ; une facture en erreur
 * n'interrompt pas les autres. Aucune PII journalisée (seulement des compteurs).
 * L'e-mail client est transactionnel (`INVOICE_REMINDER_DUE`, D3). Langue (D2) : `defaultLocale` du
 * premier site de l'organisation (validée parmi les 4 langues), sinon `DEFAULT_LOCALE` ; le lien de
 * paiement suit la même langue.
 */
import { Effect } from "effect";
import { AppConfig } from "@/lib/effect/config";
import { asc, eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { sites } from "@database/schemas/content.schema";
import { dbTry } from "@/lib/effect/run";
import { asLocale } from "@/core/notifications/email-templates";
import { isPaymentsEnabled } from "@/core/payments";
import { enqueueEmail } from "@/core/notifications/email-outbox";
import { notify } from "@/core/notifications/service";
import type { ReminderSource } from "@/core/notifications/reminders";
import type { DbTransaction } from "@/lib/effect/transaction";
import { salesService, type RecordedReminder } from "../services/salesDocument.service";
import { payLinkPath, payLinkToken } from "../payments";
import { INVOICE_REMINDER_TEMPLATE } from "./invoice-reminder-email";

export const INVOICE_REMINDER_SENT = "INVOICE_REMINDER_SENT";
/** E-mail de relance au client (transactionnel). */
export const INVOICE_REMINDER_DUE = "INVOICE_REMINDER_DUE";
export const reminderDedupeKey = (documentId: string, level: number) => `sales.reminder:${documentId}:${level}`;

/** Langue des relances d'une organisation : `defaultLocale` de son premier site (création), validée ; sinon langue par défaut. */
export const reminderLocale = (organizationId: string | null, executor: Pick<DbTransaction, "select"> = getDrizzle()) =>
  organizationId
    ? dbTry("sales.reminder_locale", () =>
        executor.select({ locale: sites.defaultLocale }).from(sites).where(eq(sites.organizationId, organizationId)).orderBy(asc(sites.createdAt), asc(sites.id)).limit(1),
      ).pipe(Effect.map(([row]) => asLocale(row?.locale)))
    : Effect.succeed(asLocale(null));

const dispatch = (secret: string) => (tx: DbTransaction, r: RecordedReminder) =>
  Effect.gen(function* () {
    const key = reminderDedupeKey(r.documentId, r.level);
    const number = r.number ?? r.documentId;
    const locale = yield* reminderLocale(r.organizationId, tx);
    if (r.customerEmail) {
      yield* enqueueEmail(
        {
          dedupeKey: key,
          organizationId: r.organizationId,
          toEmail: r.customerEmail,
          locale,
          template: INVOICE_REMINDER_TEMPLATE,
          category: "billing",
          data: {
            number, level: r.level, daysOverdue: r.daysOverdue, dueDate: r.dueDate, amountDueMinor: r.amountDueMinor, currency: r.currency,
            payPath: isPaymentsEnabled() ? payLinkPath(locale, r.documentId, payLinkToken(secret, r.documentId)) : null,
          },
        },
        tx,
      );
    }
    if (r.createdBy) {
      yield* notify(
        {
          userId: r.createdBy,
          organizationId: r.organizationId,
          module: "sales",
          type: INVOICE_REMINDER_SENT,
          category: "billing",
          resourceType: "invoice",
          resourceId: r.documentId,
          data: { number, level: r.level, daysOverdue: r.daysOverdue, emailed: Boolean(r.customerEmail) },
          dedupeKey: key,
        },
        tx,
      );
    }
  });

/** Relance les factures échues à `now` (toutes, ou seulement `ids` — tests, relance ciblée). */
export const remindInvoices = ({ now = new Date(), ids }: { now?: Date; ids?: readonly string[] } = {}) =>
  AppConfig.use((config) =>
    Effect.gen(function* () {
      const today = now.toISOString().slice(0, 10);
      const due = yield* salesService.overdueInvoiceIds(today);
      const targets = ids ? due.filter((id) => ids.includes(id)) : due;
      const results = yield* Effect.forEach(targets, (id) =>
        salesService.recordReminder(id, null, today, dispatch(config.signingSecret)).pipe(
          Effect.map((r) => (r ? 1 : 0)),
          Effect.catch(() => Effect.succeed(0)),
        ),
      );
      const sent = results.reduce<number>((a, b) => a + b, 0);
      yield* Effect.logInfo("reminders.sales.invoices", { candidates: targets.length, sent });
      return sent;
    }),
  );

export const invoiceReminderSource: ReminderSource = { id: "sales.invoices", run: (now) => remindInvoices({ now }) };
