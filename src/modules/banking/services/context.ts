/** Contexte comptable d'un rapprochement : réglages, plan, verrouillage de période, compte bancaire. */
import { and, desc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { accountingConfig } from "@/core/accounting/service";
import { salesFecExports } from "@/modules/sales/schema";
import { dbTry } from "@/lib/effect/run";
import { effectiveLockDate } from "../domain/settings";
import type { BankLedgerAccount } from "../domain/ledger";
import type { bankAccounts } from "../schema";
import { bankingSettingsService } from "./settings.service";
import { tenant } from "./shared";

/** Dernière période FEC générée (`READY`) du tenant, ou null. */
export const lastFecPeriod = (organizationId: string | null) =>
  dbTry("banking.fec.last", () => getDrizzle().select({ period: salesFecExports.period }).from(salesFecExports)
    .where(and(tenant(salesFecExports.organizationId, organizationId), eq(salesFecExports.status, "READY"))).orderBy(desc(salesFecExports.period)).limit(1))
    .pipe(Effect.map(([row]) => row?.period ?? null));

export const reconciliationContext = (organizationId: string | null) =>
  Effect.gen(function* () {
    const settings = yield* bankingSettingsService.get(organizationId);
    const chart = yield* accountingConfig(organizationId);
    const lockDate = effectiveLockDate(settings, yield* lastFecPeriod(organizationId));
    return { settings, chart, lockDate };
  });

export type ReconciliationContext = Effect.Success<ReturnType<typeof reconciliationContext>>;

export const ledgerAccountOf = (account: Pick<typeof bankAccounts.$inferSelect, "ledgerAccount" | "label" | "journalCode" | "journalLabel">): BankLedgerAccount => ({
  account: account.ledgerAccount, accountLabel: account.label.slice(0, 60), journalCode: account.journalCode, journalLabel: account.journalLabel,
});
