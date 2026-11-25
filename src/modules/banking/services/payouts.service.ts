/**
 * Versements Stripe (B20) — DÉSACTIVÉS par défaut (`stripePayoutsEnabled`). Lecture des payouts et
 * de leurs transactions de solde par le SDK Stripe déjà présent (clé `STRIPE_SECRET_KEY`, compte
 * connecté du tenant en en-tête `Stripe-Account`). Les versements alimentent la source
 * `stripe-payout` : la ligne nette de la banque est rapprochée et ventilée (brut, commissions).
 */
import { and, eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import Stripe from "stripe";
import { getDrizzle } from "@database/drizzle";
import { tenantPaymentSettings } from "@/core/payments/service";
import { fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import type { PayoutStatus } from "../domain/constants";
import { breakdown, stripeItemType, type PayoutItem } from "../domain/payouts";
import { bankPayoutItems, bankPayouts } from "../schema";
import { bankingSettingsService } from "./settings.service";
import { bankingAudit, tenant } from "./shared";

export interface RemotePayout { readonly id: string; readonly status: string; readonly arrivalDate: string; readonly currency: string; readonly amountMinor: number }

/** Accès Stripe minimal (injectable en test). */
export interface PayoutApi {
  readonly payouts: (account: string | null, sinceEpoch: number) => Promise<readonly RemotePayout[]>;
  readonly items: (account: string | null, payoutId: string) => Promise<readonly PayoutItem[]>;
}

const MAX_PAGES = 10;

export const stripePayoutApi = (secretKey: string): PayoutApi => {
  const stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "polyweb" }, telemetry: false });
  const options = (account: string | null) => (account ? { stripeAccount: account } : undefined);
  return {
    payouts: async (account, sinceEpoch) => {
      const result: RemotePayout[] = [];
      let startingAfter: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const list = await stripe.payouts.list({ arrival_date: { gte: sinceEpoch }, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) }, options(account));
        for (const payout of list.data) result.push({ id: payout.id, status: payout.status, arrivalDate: new Date(payout.arrival_date * 1000).toISOString().slice(0, 10), currency: payout.currency.toUpperCase(), amountMinor: payout.amount });
        if (!list.has_more || list.data.length === 0) break;
        startingAfter = list.data.at(-1)!.id;
      }
      return result;
    },
    items: async (account, payoutId) => {
      const result: PayoutItem[] = [];
      let startingAfter: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const list = await stripe.balanceTransactions.list({ payout: payoutId, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) }, options(account));
        for (const item of list.data) {
          if (item.type === "payout") continue;
          result.push({ externalId: item.id, type: stripeItemType(item.type), amountMinor: item.amount, feeMinor: item.fee, netMinor: item.net, sourceId: typeof item.source === "string" ? item.source : item.source?.id ?? null });
        }
        if (!list.has_more || list.data.length === 0) break;
        startingAfter = list.data.at(-1)!.id;
      }
      return result;
    },
  };
};

const statusOf = (status: string): PayoutStatus =>
  status === "paid" || status === "in_transit" || status === "pending" || status === "failed" || status === "canceled" ? status : "pending";

export const bankPayoutsService = {
  list: (organizationId: string | null, limit = 50) =>
    dbTry("banking.payouts.list", () => getDrizzle().select().from(bankPayouts).where(tenant(bankPayouts.organizationId, organizationId)).orderBy(sql`${bankPayouts.arrivalDate} desc`).limit(Math.min(Math.max(limit, 1), 200))),

  items: (organizationId: string | null, payoutId: string) =>
    dbTry("banking.payouts.items", () => getDrizzle().select({ item: bankPayoutItems }).from(bankPayoutItems).innerJoin(bankPayouts, eq(bankPayouts.id, bankPayoutItems.payoutId))
      .where(and(eq(bankPayoutItems.payoutId, payoutId), tenant(bankPayouts.organizationId, organizationId)))).pipe(Effect.map((rows) => rows.map((row) => row.item))),

  /** Synchronise les versements des `days` derniers jours (upsert ; un versement rapproché n'est pas modifié). */
  sync: (organizationId: string | null, actorId: string | null, options: { readonly days?: number; readonly api?: PayoutApi } = {}) =>
    Effect.gen(function* () {
      const settings = yield* bankingSettingsService.get(organizationId);
      if (!settings.stripePayoutsEnabled) return yield* fail("FORBIDDEN", "La synchronisation des versements Stripe est désactivée (Réglages banque).");
      const key = process.env.STRIPE_SECRET_KEY ?? "";
      if (!options.api && !key) return yield* fail("BAD_REQUEST", "STRIPE_SECRET_KEY absente : versements indisponibles.");
      const api = options.api ?? stripePayoutApi(key);
      const { accountId } = yield* tenantPaymentSettings(organizationId);
      if (organizationId !== null && !accountId && !options.api) return yield* fail("BAD_REQUEST", "Aucun compte Stripe connecté pour cette organisation.");
      const since = Math.floor(Date.now() / 1000) - Math.min(Math.max(options.days ?? 30, 1), 365) * 86_400;
      const remote = yield* Effect.tryPromise({ try: () => api.payouts(accountId, since), catch: (error) => error }).pipe(Effect.catch((error) => fail("BAD_REQUEST", `Stripe : ${error instanceof Error ? error.message : "erreur"}`)));
      let created = 0, updated = 0;
      for (const payout of remote) {
        const items = yield* Effect.tryPromise({ try: () => api.items(accountId, payout.id), catch: (error) => error }).pipe(Effect.orElseSucceed(() => [] as readonly PayoutItem[]));
        const parts = breakdown(items);
        yield* dbTransaction("banking.payouts.upsert", (tx) => Effect.gen(function* () {
          const [existing] = yield* dbTry("banking.payouts.find", () => tx.select().from(bankPayouts).where(and(tenant(bankPayouts.organizationId, organizationId), eq(bankPayouts.provider, "stripe"), eq(bankPayouts.externalId, payout.id))).limit(1).for("update"));
          const values = { status: existing?.status === "reconciled" ? "reconciled" as const : statusOf(payout.status), arrivalDate: payout.arrivalDate, currency: payout.currency, amountMinor: payout.amountMinor,
            grossMinor: parts.grossMinor, refundMinor: parts.refundMinor, feeMinor: parts.feeMinor, adjustmentMinor: parts.adjustmentMinor, updatedAt: new Date() };
          const rows = existing
            ? yield* dbTry("banking.payouts.update", () => tx.update(bankPayouts).set(values).where(eq(bankPayouts.id, existing.id)).returning({ id: bankPayouts.id }))
            : yield* dbTry("banking.payouts.insert", () => tx.insert(bankPayouts).values({ ...values, organizationId, provider: "stripe", externalId: payout.id }).returning({ id: bankPayouts.id }));
          const id = rows[0]!.id;
          if (existing) updated += 1; else created += 1;
          if (items.length) yield* dbTry("banking.payouts.items.insert", () => tx.insert(bankPayoutItems).values(items.map((item) => ({ payoutId: id, ...item }))).onConflictDoNothing({ target: [bankPayoutItems.payoutId, bankPayoutItems.externalId] }));
        }));
      }
      yield* dbTransaction("banking.payouts.audit", (tx) => bankingAudit(tx, { actorId, action: "banking.payouts.sync", resource: "bank_payout", resourceId: "stripe", organizationId, metadata: { fetched: remote.length, created, updated } }));
      return { fetched: remote.length, created, updated };
    }),
};
