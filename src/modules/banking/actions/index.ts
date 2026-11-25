/**
 * Actions Astro du module banking (back-office uniquement) : garde de permission tenant
 * (`banking:*`, `accounting:*`), validation zod, puis service Effect. Ré-exportées depuis
 * `src/actions/index.ts` (`actions.banking.*`). Aucun secret n'est jamais renvoyé.
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { APPROVAL_MODES, APPROVAL_ROLES, type ApprovalActor } from "@/core/approvals";
import { ACCOUNT_ROLES, JOURNAL_KINDS } from "@/core/accounting/chart";
import { accountingService } from "@/core/accounting/service";
import { effectHandler } from "@/lib/effect/action";
import { requireAccountingPermission, requireBankingPermission } from "../permissions";
import {
  ADJUSTMENT_KINDS, AUTOMATION_MODES, CSV_FIELDS, CSV_AMOUNT_MODES, CSV_DATE_FORMATS, CSV_DELIMITERS, CSV_ENCODINGS, LABEL_OPERATORS, RULE_ACTIONS, RULE_DIRECTIONS, STATEMENT_FORMATS,
} from "../domain/constants";

import { bankAccountsService, csvProfilesService } from "../services/accounts.service";
import { bankFeedsService } from "../services/feeds.service";
import { importStatement } from "../services/import.service";
import { bankLedgerService } from "../services/ledger.service";
import { candidatesFor, matchTransactions, suggestionsFor } from "../services/matching.service";
import { bankPayoutsService } from "../services/payouts.service";
import { bankingQueries } from "../services/queries.service";
import { decideWriteOff, reconcile, reverseReconciliation, setIgnored } from "../services/reconcile.service";
import { bankRulesService } from "../services/rules.service";
import { bankingSettingsService } from "../services/settings.service";

const org = { organizationId: z.string().nullable().default(null) };
const id = z.string().min(1).max(64);
const text = (max: number) => z.string().trim().max(max).nullable().default(null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MAX_UPLOAD_BASE64 = 14_000_000;

const actorOf = (user: { readonly id: string; readonly role?: string | null }): ApprovalActor => {
  const isPlatformAdmin = user.role === "admin";
  const organizationRole = user.role === "owner" || user.role === "orgOwner" ? "orgOwner" as const : user.role === "orgAdmin" ? "orgAdmin" as const : isPlatformAdmin ? null : "orgMember" as const;
  return { userId: user.id, isPlatformAdmin, organizationRole, permissions: ["banking:approve"] };
};

const accountFields = {
  label: z.string().trim().min(1).max(120), iban: text(34), bic: text(11), accountNumber: text(34), bankName: text(120),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()), ledgerAccount: z.string().trim().min(3).max(20), journalCode: z.string().trim().min(1).max(6),
  journalLabel: z.string().trim().min(1).max(60), openingBalanceMinor: z.number().int().nullable().default(null), openingBalanceDate: date.nullable().default(null),
  defaultFormat: z.enum(STATEMENT_FORMATS).nullable().default(null), csvProfileId: z.string().nullable().default(null), automationMode: z.enum(AUTOMATION_MODES).nullable().default(null),
};

const csvProfile = z.object({
  delimiter: z.enum(CSV_DELIMITERS), decimal: z.enum([",", "."]), dateFormat: z.enum(CSV_DATE_FORMATS), encoding: z.enum(CSV_ENCODINGS), amountMode: z.enum(CSV_AMOUNT_MODES),
  debitPositive: z.boolean(), invertSign: z.boolean(), skipLines: z.number().int().min(0).max(50), hasHeader: z.boolean(),
  columns: z.partialRecord(z.enum(CSV_FIELDS), z.string().trim().min(1).max(80)), currency: z.string().trim().length(3).nullable().default(null),
});

const ruleInput = z.object({
  id: z.string().nullable().default(null), name: z.string().trim().min(1).max(120), position: z.number().int().min(0).max(100_000).default(100), active: z.boolean().default(true),
  conditions: z.object({
    bankAccountId: z.string().nullable().default(null), direction: z.enum(RULE_DIRECTIONS).default("any"),
    amountMinMinor: z.number().int().min(0).nullable().default(null), amountMaxMinor: z.number().int().min(0).nullable().default(null),
    label: z.object({ operator: z.enum(LABEL_OPERATORS), value: z.string().trim().min(1).max(200) }).nullable().default(null),
    counterpartyIban: text(34), counterpartyName: text(140), bankCode: text(35),
  }),
  actions: z.object({
    kind: z.enum(RULE_ACTIONS), accountCode: text(20), vatRate: text(6), label: text(200), auxAccount: text(20), auxLabel: text(120),
    targetBankAccountId: z.string().nullable().default(null), autoValidate: z.boolean().default(false),
  }),
});

const reconcileInput = z.object({
  ...org,
  transactionIds: z.array(id).min(1).max(50),
  allocations: z.array(z.object({ source: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/), targetId: id, amountMinor: z.number().int().positive() })).max(50).default([]),
  adjustments: z.array(z.object({ kind: z.enum(ADJUSTMENT_KINDS), bankEffectMinor: z.number().int() })).max(10).default([]),
  note: text(500),
});

export const bankingActions = {
  saveSettings: defineAction({
    input: z.object({
      ...org, settings: z.record(z.string(), z.unknown()),
      approvalMode: z.enum(APPROVAL_MODES), approvalThresholdMinor: z.number().int().min(0),
      approvalBands: z.array(z.object({ level: z.number().int().min(1).max(20), minMinor: z.number().int().min(0), maxMinor: z.number().int().positive().nullable(), requiredRole: z.enum(APPROVAL_ROLES), requiredPermission: z.string().trim().max(80).nullable().default(null) })).max(20).default([]),
    }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["settings"], input.organizationId);
      return yield* bankingSettingsService.save(input.organizationId, input.settings, { mode: input.approvalMode, thresholdMinor: input.approvalThresholdMinor, currency: "EUR", bands: input.approvalBands }, user.id);
    })),
  }),

  saveAccount: defineAction({
    input: z.object({ ...org, id: z.string().nullable().default(null), ...accountFields }),
    handler: effectHandler(({ organizationId, id: accountId, ...input }, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["accounts"], organizationId);
      return yield* bankAccountsService.save(organizationId, accountId, input, user.id);
    })),
  }),
  setAccountStatus: defineAction({
    input: z.object({ ...org, id, status: z.enum(["active", "archived"]) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["accounts"], input.organizationId);
      return yield* bankAccountsService.setStatus(input.organizationId, input.id, input.status, user.id);
    })),
  }),

  saveCsvProfile: defineAction({
    input: z.object({ ...org, id: z.string().nullable().default(null), name: z.string().trim().min(1).max(80), profile: csvProfile }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["import"], input.organizationId);
      return yield* csvProfilesService.save(input.organizationId, input.id, input.name, input.profile, user.id);
    })),
  }),
  removeCsvProfile: defineAction({
    input: z.object({ ...org, id }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["import"], input.organizationId);
      return yield* csvProfilesService.remove(input.organizationId, input.id, user.id);
    })),
  }),

  importStatement: defineAction({
    input: z.object({ ...org, bankAccountId: id, fileName: z.string().trim().min(1).max(200), contentBase64: z.string().min(4).max(MAX_UPLOAD_BASE64), format: z.enum(STATEMENT_FORMATS).nullable().default(null), csvProfileId: z.string().nullable().default(null) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["import"], input.organizationId);
      const bytes = Uint8Array.from(Buffer.from(input.contentBase64, "base64"));
      return yield* importStatement(input.organizationId, { bankAccountId: input.bankAccountId, bytes, fileName: input.fileName, format: input.format, csvProfileId: input.csvProfileId, source: "upload" }, user.id);
    })),
  }),

  /** Recalcule les suggestions (sans rapprochement automatique) des lignes données. */
  refreshSuggestions: defineAction({
    input: z.object({ ...org, transactionIds: z.array(id).min(1).max(500) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["reconcile"], input.organizationId);
      return yield* matchTransactions(input.organizationId, input.transactionIds, { allowAuto: false, actorId: user.id });
    })),
  }),
  /** Propositions et candidats d'une ligne (écran de rapprochement), recherche libre possible. */
  candidates: defineAction({
    input: z.object({ ...org, transactionId: id, search: z.string().trim().max(100).optional() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      yield* requireBankingPermission(context, ["read"], input.organizationId);
      const row = yield* bankingQueries.transaction(input.organizationId, input.transactionId);
      const settings = yield* bankingSettingsService.get(input.organizationId);
      if (input.search) {
        const found = yield* candidatesFor(input.organizationId, row, { settings }, input.search);
        return { proposals: [], candidates: found.candidates };
      }
      const { proposals, candidates } = yield* suggestionsFor(input.organizationId, row, { settings });
      return { proposals, candidates };
    })),
  }),
  reconcile: defineAction({
    input: reconcileInput,
    handler: effectHandler(({ organizationId, ...request }, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["reconcile"], organizationId);
      return yield* reconcile(organizationId, request, { mode: "manual", actorId: user.id });
    })),
  }),
  decideWriteOff: defineAction({
    input: z.object({ ...org, id, decision: z.enum(["APPROVED", "REJECTED"]), comment: text(1000) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["approve"], input.organizationId);
      return yield* decideWriteOff(input.organizationId, input.id, actorOf(user), input.decision, input.comment);
    })),
  }),
  unreconcile: defineAction({
    input: z.object({ ...org, id, reason: z.string().trim().min(3).max(500) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["unreconcile"], input.organizationId);
      return yield* reverseReconciliation(input.organizationId, input.id, input.reason, user.id);
    })),
  }),
  setIgnored: defineAction({
    input: z.object({ ...org, transactionIds: z.array(id).min(1).max(500), ignored: z.boolean(), note: text(500) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["reconcile"], input.organizationId);
      return { count: yield* setIgnored(input.organizationId, input.transactionIds, input.ignored, input.note, user.id) };
    })),
  }),

  saveRule: defineAction({
    input: z.object({ ...org, rule: ruleInput }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["rules"], input.organizationId);
      return yield* bankRulesService.save(input.organizationId, input.rule, user.id);
    })),
  }),
  removeRule: defineAction({
    input: z.object({ ...org, id }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["rules"], input.organizationId);
      return yield* bankRulesService.remove(input.organizationId, input.id, user.id);
    })),
  }),
  reorderRules: defineAction({
    input: z.object({ ...org, ids: z.array(id).min(1).max(500) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["rules"], input.organizationId);
      return yield* bankRulesService.reorder(input.organizationId, input.ids, user.id);
    })),
  }),
  dryRunRule: defineAction({
    input: z.object({ ...org, rule: ruleInput }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      yield* requireBankingPermission(context, ["rules"], input.organizationId);
      const { id: _id, ...rule } = input.rule;
      return yield* bankRulesService.dryRun(input.organizationId, rule);
    })),
  }),

  exportLedger: defineAction({
    input: z.object({ ...org, from: date.nullable().default(null), to: date.nullable().default(null), bankAccountId: z.string().nullable().default(null), kind: z.string().max(20).nullable().default(null) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      yield* requireBankingPermission(context, ["read"], input.organizationId);
      return { csv: yield* bankLedgerService.exportCsv(input.organizationId, input) };
    })),
  }),

  saveFeedCredentials: defineAction({
    input: z.object({ ...org, connectionId: z.string().nullable().default(null), bankAccountId: id, secretId: z.string().trim().min(8).max(200), secretKey: z.string().trim().min(16).max(500) }),
    handler: effectHandler(({ organizationId, ...input }, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["accounts"], organizationId);
      return yield* bankFeedsService.saveCredentials(organizationId, input, user.id);
    })),
  }),
  feedInstitutions: defineAction({
    input: z.object({ ...org, connectionId: id, country: z.string().trim().length(2) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      yield* requireBankingPermission(context, ["accounts"], input.organizationId);
      return yield* bankFeedsService.institutions(input.organizationId, input.connectionId, input.country);
    })),
  }),
  startFeedLink: defineAction({
    input: z.object({ ...org, connectionId: id, institutionId: z.string().trim().min(2).max(100), language: z.enum(["fr", "en", "es", "ar"]).default("fr") }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["accounts"], input.organizationId);
      const redirectUrl = new URL(`/${input.language}/admin/banking/accounts?feed=${encodeURIComponent(input.connectionId)}`, context.url.origin).toString();
      return yield* bankFeedsService.startLink(input.organizationId, input.connectionId, { institutionId: input.institutionId, redirectUrl, language: input.language }, user.id);
    })),
  }),
  refreshFeed: defineAction({
    input: z.object({ ...org, connectionId: id }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["accounts"], input.organizationId);
      return yield* bankFeedsService.refresh(input.organizationId, input.connectionId, user.id);
    })),
  }),
  syncFeed: defineAction({
    input: z.object({ ...org, connectionId: id }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["import"], input.organizationId);
      return yield* bankFeedsService.sync(input.organizationId, input.connectionId, user.id);
    })),
  }),
  disconnectFeed: defineAction({
    input: z.object({ ...org, connectionId: id }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["accounts"], input.organizationId);
      return yield* bankFeedsService.disconnect(input.organizationId, input.connectionId, user.id);
    })),
  }),
  syncPayouts: defineAction({
    input: z.object({ ...org, days: z.number().int().min(1).max(365).default(30) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireBankingPermission(context, ["import"], input.organizationId);
      return yield* bankPayoutsService.sync(input.organizationId, user.id, { days: input.days });
    })),
  }),

  saveAccountingSettings: defineAction({
    input: z.object({
      ...org, letteringEnabled: z.boolean(),
      roleCodes: z.partialRecord(z.enum(ACCOUNT_ROLES), z.string().trim().max(20)),
      journals: z.partialRecord(z.enum(JOURNAL_KINDS), z.object({ code: z.string().trim().min(1).max(10), label: z.string().trim().min(1).max(60) })),
    }),
    handler: effectHandler(({ organizationId, ...input }, context) => Effect.gen(function* () {
      const user = yield* requireAccountingPermission(context, ["manage"], organizationId);
      return yield* accountingService.saveSettings(organizationId, input, user.id);
    })),
  }),
  upsertChartAccount: defineAction({
    input: z.object({ ...org, code: z.string().trim().min(3).max(20), label: z.string().trim().min(1).max(120), kind: z.enum(["asset", "liability", "equity", "income", "expense"]), active: z.boolean().default(true) }),
    handler: effectHandler(({ organizationId, ...input }, context) => Effect.gen(function* () {
      const user = yield* requireAccountingPermission(context, ["manage"], organizationId);
      return yield* accountingService.upsertAccount(organizationId, { ...input, code: input.code.toUpperCase() }, user.id);
    })),
  }),
  setChartAccountActive: defineAction({
    input: z.object({ ...org, code: z.string().trim().min(3).max(20), active: z.boolean() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireAccountingPermission(context, ["manage"], input.organizationId);
      return yield* accountingService.setAccountActive(input.organizationId, input.code, input.active, user.id);
    })),
  }),
};
