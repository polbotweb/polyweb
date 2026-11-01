/**
 * Récepteur des événements d'abonnement fournisseur (`setSubscriptionEventSink`, branché au démarrage).
 * Une transaction par événement : trace `payment_events` (idempotence générique de core/payments,
 * `recordPaymentEvent`) + effet métier. Par facture fournisseur, une facture Sales (`provider_invoice_id`) :
 * - `invoice_paid` : facture émise puis encaissement carte (référence = facture fournisseur) ;
 * - `invoice_failed` : facture émise à échéance immédiate, abonnement `past_due` — les relances
 *   Sales (`overdueInvoices` / `recordReminder`, tâche planifiée existante) assurent le recouvrement.
 */
import { Effect } from "effect";
import { and, eq } from "drizzle-orm";
import { dbTry } from "@/lib/effect/run";
import { DbError } from "@/lib/effect/errors";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { recordPaymentEvent, type PaymentProvider, type SubscriptionEventOutcome, type VerifiedPaymentEvent, type VerifiedSubscriptionEvent } from "@/core/payments";
import { issueProviderInvoice, recordProviderInvoicePayment } from "@/modules/sales/services/salesDocument.service";
import { sellerProfileOf } from "@/modules/sales/loaders/sellerProfile.loader";
import { subscriptionPlans, subscriptions } from "../schema";
import { providerPatch } from "../domain/lifecycle";
import type { SubscriptionRow } from "./subscription.service";

/** Pays vendeur par défaut si le profil vendeur du tenant n'est pas renseigné. */
const DEFAULT_SELLER_COUNTRY = "FR";

const findTarget = (tx: DbTransaction, providerName: string, event: VerifiedSubscriptionEvent) =>
  Effect.gen(function* () {
    if (event.subscriptionId) {
      const [byId] = yield* dbTry("subscriptions.webhook.byId", () => tx.select().from(subscriptions).where(eq(subscriptions.id, event.subscriptionId!)).limit(1).for("update"));
      // Métadonnée honorée seulement si cohérente (même fournisseur, pas d'autre abonnement fournisseur déjà lié).
      if (byId && byId.provider === providerName && (byId.providerSubscriptionId === null || byId.providerSubscriptionId === event.providerSubscriptionId)) return byId;
    }
    const [byProvider] = yield* dbTry("subscriptions.webhook.byProvider", () => tx.select().from(subscriptions)
      .where(and(eq(subscriptions.provider, providerName), eq(subscriptions.providerSubscriptionId, event.providerSubscriptionId))).limit(1).for("update"));
    return byProvider ?? null;
  });

const salesInvoiceFor = (tx: DbTransaction, sub: SubscriptionRow, event: VerifiedSubscriptionEvent, paymentTermDays: number, today: string) =>
  Effect.gen(function* () {
    const invoice = event.invoice!;
    const [plan] = yield* dbTry("subscriptions.webhook.plan", () => tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1));
    const seller = yield* sellerProfileOf(sub.organizationId);
    const period = `${invoice.periodStart.toISOString().slice(0, 10)} → ${invoice.periodEnd.toISOString().slice(0, 10)}`;
    return yield* issueProviderInvoice(tx, {
      organizationId: sub.organizationId, providerInvoiceId: invoice.providerInvoiceId,
      title: `Abonnement ${plan?.name ?? ""} — ${period}`.slice(0, 200), description: `${plan?.name ?? "Abonnement"} (${period})`.slice(0, 500),
      customerName: sub.customerName, customerEmail: sub.customerEmail, customerCountry: sub.customerCountry, customerType: sub.customerType,
      sellerCountry: seller?.country ?? DEFAULT_SELLER_COUNTRY, supplyType: plan?.supplyType ?? "services", taxCategory: plan?.taxCategory ?? "standard",
      currency: invoice.amount.currency, grossMinor: invoice.amount.amountMinor, paymentTermDays, notes: `Facture fournisseur ${invoice.providerInvoiceId}`,
    }, today);
  });

const applyEvent = (tx: DbTransaction, sub: SubscriptionRow, event: VerifiedSubscriptionEvent, now: Date) =>
  Effect.gen(function* () {
    const today = now.toISOString().slice(0, 10);
    const patch: Partial<SubscriptionRow> = providerPatch(event, now, event.action === "deleted");
    if (event.action === "invoice_paid" && event.invoice && event.invoice.amount.amountMinor > 0) {
      const { invoice, issued } = yield* salesInvoiceFor(tx, sub, event, 0, today);
      if (!issued) yield* Effect.logError("[subscriptions] facture Sales laissée en brouillon (montant inatteignable) — à émettre manuellement", { invoiceId: invoice.id, providerInvoiceId: event.invoice.providerInvoiceId });
      else {
        const paidAt = today;
        const recorded = yield* recordProviderInvoicePayment(tx, invoice.id, { amountMinor: event.invoice.amount.amountMinor, currency: event.invoice.amount.currency, reference: event.invoice.providerInvoiceId, paidAt });
        if (!recorded) yield* Effect.logError("[subscriptions] encaissement non imputable sur la facture Sales", { invoiceId: invoice.id, providerInvoiceId: event.invoice.providerInvoiceId });
      }
      if (!event.status && (sub.status === "past_due" || sub.status === "unpaid" || sub.status === "incomplete")) patch.status = "active";
    }
    if (event.action === "invoice_failed" && event.invoice && event.invoice.amount.amountMinor > 0) {
      const { invoice, issued } = yield* salesInvoiceFor(tx, sub, event, 0, today);
      if (!issued) yield* Effect.logError("[subscriptions] facture Sales impayée laissée en brouillon (montant inatteignable)", { invoiceId: invoice.id });
      if (!event.status) patch.status = "past_due";
    }
    yield* dbTry("subscriptions.webhook.apply", () => tx.update(subscriptions).set(patch).where(eq(subscriptions.id, sub.id)));
  });

/** Récepteur branché par `bootstrap` : refus métier journalisés, seule une `DbError` remonte. */
export const handleSubscriptionEvent = (provider: PaymentProvider, event: VerifiedPaymentEvent, now: Date = new Date()): Effect.Effect<SubscriptionEventOutcome, DbError> =>
  Effect.gen(function* () {
    const payload = event.subscription;
    if (!payload) {
      yield* Effect.logWarning("[subscriptions] événement d'abonnement sans charge utile", event.type);
      return "unmatched" as const;
    }
    return yield* dbTransaction("subscriptions.webhook", (tx) =>
      Effect.gen(function* () {
        const sub = yield* findTarget(tx, provider.name, payload);
        if (!sub) {
          yield* Effect.logWarning("[subscriptions] abonnement fournisseur inconnu", { providerSubscriptionId: payload.providerSubscriptionId, type: event.type });
          return "unmatched" as const;
        }
        const trace = yield* recordPaymentEvent(tx, provider, event);
        if (trace === null) return "duplicate" as const;
        yield* applyEvent(tx, sub, payload, now);
        return "applied" as const;
      }),
    ).pipe(
      // Refus métier (facture non émissible, devise inconnue…) : journalisé, réponse 200 ; seule DbError remonte (rejeu).
      Effect.catch((error) => (error instanceof DbError
        ? Effect.fail(error)
        : Effect.logError("[subscriptions] événement non applicable", { type: event.type, reason: String((error as { message?: unknown }).message ?? error) }).pipe(Effect.as("unchanged" as const)))),
    );
  });
