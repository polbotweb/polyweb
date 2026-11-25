/**
 * Réglages banking par organisation (B18) et politique d'approbation des passages en perte ou
 * profit (core/approvals, module `banking`, ressource `write_off`). Défauts implicites.
 */
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { approvalBands, approvalPolicies } from "@/core/approvals/schema";
import { validatePolicy, type ApprovalBand, type ApprovalPolicy } from "@/core/approvals";
import { fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { resolveBankingSettings, type BankingSettings } from "../domain/settings";
import { bankSettings } from "../schema";
import { bankingAudit, tenant } from "./shared";

/** Par défaut : approbation (administrateur d'organisation) au-delà de 50,00 € passés en perte ou profit. */
export const DEFAULT_WRITE_OFF_POLICY: ApprovalPolicy = { mode: "single_threshold", thresholdMinor: 5000, currency: "EUR", bands: [] };
const policyScope = (organizationId: string | null) =>
  and(tenant(approvalPolicies.organizationId, organizationId), eq(approvalPolicies.module, "banking"), eq(approvalPolicies.resourceType, "write_off"));

const readPolicy = (organizationId: string | null) =>
  Effect.gen(function* () {
    const [policy] = yield* dbTry("banking.policy.get", () => getDrizzle().select().from(approvalPolicies).where(policyScope(organizationId)).limit(1));
    if (!policy) return { policy: DEFAULT_WRITE_OFF_POLICY, policyId: null };
    const rows = yield* dbTry("banking.policy.bands", () => getDrizzle().select().from(approvalBands).where(eq(approvalBands.policyId, policy.id)));
    const bands: ApprovalBand[] = rows.map((band) => ({ level: band.level, minMinor: band.minMinor, maxMinor: band.maxMinor, requiredRole: band.requiredRole, requiredPermission: band.requiredPermission }));
    return { policy: { mode: policy.mode, thresholdMinor: policy.thresholdMinor, currency: policy.currency, bands } as ApprovalPolicy, policyId: policy.id };
  });

const writePolicy = (tx: DbTransaction, organizationId: string | null, policy: ApprovalPolicy) =>
  Effect.gen(function* () {
    const [current] = yield* dbTry("banking.policy.find", () => tx.select().from(approvalPolicies).where(policyScope(organizationId)).limit(1).for("update"));
    const values = { organizationId, module: "banking", resourceType: "write_off", mode: policy.mode, thresholdMinor: policy.thresholdMinor, currency: policy.currency };
    const [row] = current
      ? yield* dbTry("banking.policy.update", () => tx.update(approvalPolicies).set(values).where(eq(approvalPolicies.id, current.id)).returning())
      : yield* dbTry("banking.policy.insert", () => tx.insert(approvalPolicies).values(values).returning());
    yield* dbTry("banking.policy.bands.clear", () => tx.delete(approvalBands).where(eq(approvalBands.policyId, row!.id)));
    if (policy.bands.length) {
      yield* dbTry("banking.policy.bands.insert", () => tx.insert(approvalBands).values(policy.bands.map((band) => ({
        policyId: row!.id, level: band.level, minMinor: band.minMinor, maxMinor: band.maxMinor, requiredRole: band.requiredRole, requiredPermission: band.requiredPermission,
      }))));
    }
  });

export const bankingSettingsService = {
  /** Réglages effectifs (défauts fusionnés) ; une configuration stockée invalide retombe sur les défauts. */
  get: (organizationId: string | null) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("banking.settings.get", () => getDrizzle().select().from(bankSettings).where(tenant(bankSettings.organizationId, organizationId)).limit(1));
      const settings = yield* resolveBankingSettings(row?.config ?? {}).pipe(Effect.catch(() => resolveBankingSettings({})), Effect.orDie);
      return settings;
    }),

  getWithPolicy: (organizationId: string | null) =>
    Effect.gen(function* () {
      const settings = yield* bankingSettingsService.get(organizationId);
      const { policy, policyId } = yield* readPolicy(organizationId);
      return { settings, approval: policy, policyId };
    }),

  save: (organizationId: string | null, input: unknown, approval: ApprovalPolicy | null, actorId: string) =>
    Effect.gen(function* () {
      const settings = yield* resolveBankingSettings(input).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      const policy = approval ? yield* validatePolicy(approval).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message))) : null;
      return yield* dbTransaction("banking.settings.save", (tx) =>
        Effect.gen(function* () {
          const [existing] = yield* dbTry("banking.settings.find", () => tx.select().from(bankSettings).where(tenant(bankSettings.organizationId, organizationId)).limit(1).for("update"));
          const config = settings as unknown as Record<string, unknown>;
          const [row] = existing
            ? yield* dbTry("banking.settings.update", () => tx.update(bankSettings).set({ config, updatedBy: actorId }).where(eq(bankSettings.id, existing.id)).returning())
            : yield* dbTry("banking.settings.insert", () => tx.insert(bankSettings).values({ organizationId, config, updatedBy: actorId }).returning());
          if (policy) yield* writePolicy(tx, organizationId, policy);
          yield* bankingAudit(tx, { actorId, action: "banking.settings.update", resource: "bank_settings", resourceId: row!.id, organizationId, metadata: { automationMode: settings.automationMode, feedsEnabled: settings.feedsEnabled, approval: policy?.mode ?? null } });
          return settings satisfies BankingSettings;
        }));
    }),
};
