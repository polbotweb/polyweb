/**
 * Tâche planifiée banking (`POST /api/cron/banking`, horaire) : pour chaque tenant dont l'heure
 * locale réglée (`cronHour`, Europe/Paris) est atteinte — synchronisation des flux et versements
 * (s'ils sont activés), nouvelle passe de rapprochement automatique sur les lignes ouvertes,
 * alerte d'ancienneté, résumé quotidien, purge des fichiers bruts au-delà de la conservation.
 * Idempotente par jour (clés de déduplication des notifications).
 */
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { Effect, Result } from "effect";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import { privateStorage } from "@/lib/storage/private";
import { bankAccounts, bankFeedConnections, bankImports, bankSettings, bankTransactions } from "../schema";
import { bankFeedsService } from "./feeds.service";
import { matchTransactions } from "./matching.service";
import { notifyBanking } from "./notify.service";
import { bankPayoutsService } from "./payouts.service";
import { bankingSettingsService } from "./settings.service";
import { bankingToday, tenant } from "./shared";

const parisHour = (now: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(now)) % 24;

/** Tenants concernés : ceux qui ont un compte bancaire ou des réglages banking. */
const tenants = () =>
  Effect.gen(function* () {
    const accounts = yield* dbTry("banking.cron.tenants.accounts", () => getDrizzle().selectDistinct({ organizationId: bankAccounts.organizationId }).from(bankAccounts));
    const settings = yield* dbTry("banking.cron.tenants.settings", () => getDrizzle().selectDistinct({ organizationId: bankSettings.organizationId }).from(bankSettings));
    return [...new Set([...accounts, ...settings].map((row) => row.organizationId))];
  });

export const runBankingCronForTenant = (organizationId: string | null, now: Date = new Date(), force = false) =>
  Effect.gen(function* () {
    const settings = yield* bankingSettingsService.get(organizationId);
    if (!force && parisHour(now) !== settings.cronHour) return { skipped: true as const };
    const today = bankingToday(now);
    let feeds = 0, payouts = 0;
    if (settings.feedsEnabled) {
      const connections = yield* dbTry("banking.cron.feeds", () => getDrizzle().select({ id: bankFeedConnections.id }).from(bankFeedConnections)
        .where(and(tenant(bankFeedConnections.organizationId, organizationId), eq(bankFeedConnections.status, "linked"))));
      for (const connection of connections) {
        const outcome = yield* Effect.result(bankFeedsService.sync(organizationId, connection.id, null));
        if (Result.isSuccess(outcome)) feeds += 1;
      }
    }
    if (settings.stripePayoutsEnabled) {
      const outcome = yield* Effect.result(bankPayoutsService.sync(organizationId, null, { days: 7 }));
      if (Result.isSuccess(outcome)) payouts = outcome.success.fetched;
    }
    const open = yield* dbTry("banking.cron.open", () => getDrizzle().select({ id: bankTransactions.id }).from(bankTransactions)
      .where(and(tenant(bankTransactions.organizationId, organizationId), inArray(bankTransactions.status, ["unmatched", "suggested"]))).limit(2000));
    const matched = yield* matchTransactions(organizationId, open.map((row) => row.id), { allowAuto: true, actorId: null }).pipe(Effect.orElseSucceed(() => ({ processed: 0, suggested: 0, autoMatched: 0, ruled: 0 })));
    const agingLimit = new Date(Date.parse(`${today}T00:00:00Z`) - settings.agingDays * 86_400_000).toISOString().slice(0, 10);
    const [aged] = yield* dbTry("banking.cron.aged", () => getDrizzle().select({ n: sql<number>`count(*)::int` }).from(bankTransactions)
      .where(and(tenant(bankTransactions.organizationId, organizationId), inArray(bankTransactions.status, ["unmatched", "suggested", "partial"]), lt(bankTransactions.bookingDate, agingLimit))));
    const retentionLimit = new Date(now.getTime() - settings.retentionDays * 86_400_000);
    const expired = yield* dbTry("banking.cron.retention", () => getDrizzle().select({ id: bankImports.id, storageKey: bankImports.storageKey }).from(bankImports)
      .where(and(tenant(bankImports.organizationId, organizationId), lt(bankImports.createdAt, retentionLimit), sql`${bankImports.storageKey} is not null`)).limit(500));
    for (const row of expired) {
      const removed = yield* Effect.result(privateStorage().remove(row.storageKey!));
      if (Result.isSuccess(removed)) yield* dbTry("banking.cron.retention.mark", () => getDrizzle().update(bankImports).set({ storageKey: null }).where(eq(bankImports.id, row.id)));
    }
    yield* dbTransaction("banking.cron.notify", (tx) => Effect.gen(function* () {
      if ((aged?.n ?? 0) > 0) yield* notifyBanking(tx, { organizationId, settings, kind: "aging", resourceType: "banking", resourceId: organizationId ?? "platform", data: { count: aged!.n, days: settings.agingDays }, dedupeKey: `banking:aging:${organizationId ?? "platform"}:${today}` });
      yield* notifyBanking(tx, { organizationId, settings, kind: "dailyDigest", resourceType: "banking", resourceId: organizationId ?? "platform", data: { autoMatched: matched.autoMatched + matched.ruled, suggested: matched.suggested, aged: aged?.n ?? 0 }, dedupeKey: `banking:digest:${organizationId ?? "platform"}:${today}` });
    }));
    return { skipped: false as const, feeds, payouts, autoMatched: matched.autoMatched + matched.ruled, suggested: matched.suggested, aged: aged?.n ?? 0, purged: expired.length };
  });

export const runBankingCron = (now: Date = new Date()) =>
  Effect.gen(function* () {
    const list = yield* tenants();
    let ran = 0, failed = 0;
    for (const organizationId of list) {
      const outcome = yield* Effect.result(runBankingCronForTenant(organizationId, now));
      if (Result.isFailure(outcome)) failed += 1;
      else if (!outcome.success.skipped) ran += 1;
    }
    return { tenants: list.length, ran, failed };
  });

