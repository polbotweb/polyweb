/**
 * Réglages d'achats par tenant et politique d'approbation associée (core/approvals).
 */
import { Effect } from "effect";
import { and, eq, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/action";
import { approvalBands, approvalPolicies } from "@/core/approvals/schema";
import { DEFAULT_APPROVAL_POLICY, validatePolicy, type ApprovalBand, type ApprovalMode, type ApprovalPolicy } from "@/core/approvals";
import { DEFAULT_PURCHASING_SETTINGS, validatePurchasingSettings, type PurchasingSettings } from "../domain/settings";
import { purchasingEmailTemplates, purchasingSettings } from "../schema/extended";
import {
  listPurchasingEmailTemplates, validatePurchasingEmailTemplates, type PurchasingEmailTemplateInput,
} from "./email-templates.service";

const sameTenant = (organizationId: string | null) =>
  organizationId === null ? isNull(purchasingSettings.organizationId) : eq(purchasingSettings.organizationId, organizationId);

const policyScope = (organizationId: string | null) =>
  and(
    organizationId === null ? isNull(approvalPolicies.organizationId) : eq(approvalPolicies.organizationId, organizationId),
    eq(approvalPolicies.module, "purchasing"),
    eq(approvalPolicies.resourceType, "purchase_order"),
  );

const fromRow = (row: typeof purchasingSettings.$inferSelect | undefined): PurchasingSettings => {
  if (!row) return DEFAULT_PURCHASING_SETTINGS;
  return {
    reorderMode: row.reorderMode,
    reorderHour: row.reorderHour,
    reorderIncludeReservations: row.reorderIncludeReservations,
    reorderAutoSendTrustedOnly: row.reorderAutoSendTrustedOnly,
    matchingMode: row.matchingMode,
    toleranceAbsoluteMinor: row.toleranceAbsoluteMinor,
    tolerancePercent: Number(row.tolerancePercent),
    matchingPolicy: row.matchingPolicy,
    defaultTaxCategory: row.defaultTaxCategory,
    defaultPaymentTermDays: row.defaultPaymentTermDays,
    defaultCurrency: row.defaultCurrency,
    qualityControlRequired: row.qualityControlRequired,
    allowServiceLines: row.allowServiceLines,
    allowMultiWarehouse: row.allowMultiWarehouse,
    poPrefix: row.poPrefix,
    receiptPrefix: row.receiptPrefix,
    invoicePrefix: row.invoicePrefix,
    creditPrefix: row.creditPrefix,
    returnPrefix: row.returnPrefix,
    sepaPrefix: row.sepaPrefix,
    debtorName: row.debtorName,
    debtorIban: row.debtorIban,
    debtorBic: row.debtorBic,
  };
};

export const purchasingSettingsService = {
  get: (organizationId: string | null) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("purchasing.settings.get", () =>
        getDrizzle().select().from(purchasingSettings).where(sameTenant(organizationId)).limit(1));
      const [policy] = yield* dbTry("purchasing.settings.policy", () =>
        getDrizzle().select().from(approvalPolicies).where(policyScope(organizationId)).limit(1));
      let bands: ApprovalBand[] = [];
      if (policy) {
        const rows = yield* dbTry("purchasing.settings.bands", () =>
          getDrizzle().select().from(approvalBands).where(eq(approvalBands.policyId, policy.id)));
        bands = rows.map((band) => ({
          level: band.level, minMinor: band.minMinor, maxMinor: band.maxMinor,
          requiredRole: band.requiredRole, requiredPermission: band.requiredPermission,
        }));
      }
      const approval: ApprovalPolicy = policy
        ? { mode: policy.mode, thresholdMinor: policy.thresholdMinor, currency: policy.currency, bands }
        : DEFAULT_APPROVAL_POLICY;
      const templates = yield* listPurchasingEmailTemplates(organizationId);
      return { settings: fromRow(row), approval, templates };
    }),

  save: (organizationId: string | null, settings: PurchasingSettings, approval: ApprovalPolicy, actorId: string, templates?: readonly PurchasingEmailTemplateInput[]) =>
    Effect.gen(function* () {
      const valid = yield* validatePurchasingSettings(settings).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      const policy = yield* validatePolicy(approval).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      return yield* dbTransaction("purchasing.settings.save", (tx) =>
        Effect.gen(function* () {
          const [existing] = yield* dbTry("purchasing.settings.find", () =>
            tx.select().from(purchasingSettings).where(sameTenant(organizationId)).limit(1).for("update"));
          const values = { ...valid, tolerancePercent: String(valid.tolerancePercent), organizationId, updatedBy: actorId };
          if (existing) yield* dbTry("purchasing.settings.update", () => tx.update(purchasingSettings).set(values).where(eq(purchasingSettings.id, existing.id)));
          else yield* dbTry("purchasing.settings.insert", () => tx.insert(purchasingSettings).values(values));
          const [currentPolicy] = yield* dbTry("purchasing.policy.find", () =>
            tx.select().from(approvalPolicies).where(policyScope(organizationId)).limit(1).for("update"));
          const policyValues = {
            organizationId, module: "purchasing", resourceType: "purchase_order",
            mode: policy.mode, thresholdMinor: policy.thresholdMinor, currency: policy.currency,
          };
          const policyRow = currentPolicy
            ? (yield* dbTry("purchasing.policy.update", () => tx.update(approvalPolicies).set(policyValues).where(eq(approvalPolicies.id, currentPolicy.id)).returning()))[0]
            : (yield* dbTry("purchasing.policy.insert", () => tx.insert(approvalPolicies).values(policyValues).returning()))[0];
          yield* dbTry("purchasing.bands.clear", () => tx.delete(approvalBands).where(eq(approvalBands.policyId, policyRow!.id)));
          if (policy.bands.length > 0) {
            yield* dbTry("purchasing.bands.insert", () => tx.insert(approvalBands).values(policy.bands.map((band) => ({
              policyId: policyRow!.id, level: band.level, minMinor: band.minMinor, maxMinor: band.maxMinor,
              requiredRole: band.requiredRole, requiredPermission: band.requiredPermission,
            }))));
          }
          if (templates !== undefined) {
            const validTemplates = validatePurchasingEmailTemplates(templates);
            yield* dbTry("purchasing.emailTemplates.clear", () =>
              tx.delete(purchasingEmailTemplates).where(
                organizationId === null ? isNull(purchasingEmailTemplates.organizationId) : eq(purchasingEmailTemplates.organizationId, organizationId),
              ));
            if (validTemplates.length > 0) {
              yield* dbTry("purchasing.emailTemplates.insert", () => tx.insert(purchasingEmailTemplates).values(validTemplates.map((row) => ({
                organizationId, locale: row.locale, purpose: row.purpose, subject: row.subject, bodyHtml: row.bodyHtml,
              }))));
            }
            return { settings: valid, approval: policy, templates: validTemplates };
          }
          const kept = yield* dbTry("purchasing.emailTemplates.kept", () =>
            tx.select().from(purchasingEmailTemplates).where(
              organizationId === null ? isNull(purchasingEmailTemplates.organizationId) : eq(purchasingEmailTemplates.organizationId, organizationId),
            ));
          return { settings: valid, approval: policy, templates: kept.map((row) => ({ locale: row.locale, purpose: row.purpose, subject: row.subject, bodyHtml: row.bodyHtml })) };
        }));
    }),
};
