/**
 * Règles de rapprochement (B12) : CRUD audité, réordonnancement, simulation sur l'historique
 * (sans écriture) et application d'une règle à une ligne (écriture banque, TVA ventilée).
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { fail } from "@/lib/effect/action";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { ruleEntry } from "../domain/ledger";
import { firstMatchingRule, ruleMatches, validateRule, type BankRule, type RuleLine } from "../domain/rules";
import { postingDate } from "../domain/settings";
import { bankAccounts, bankReconciliationLines, bankReconciliations, bankRules, bankTransactions } from "../schema";
import { ledgerAccountOf, type ReconciliationContext } from "./context";
import { insertLedgerEntry } from "./ledger.service";
import { bankingAudit, tenant } from "./shared";

type RuleRow = typeof bankRules.$inferSelect;
type TransactionRow = typeof bankTransactions.$inferSelect;

export const ruleLineOf = (row: Pick<TransactionRow, "bankAccountId" | "amountMinor" | "label" | "counterpartyName" | "counterpartyIban" | "bankCode">): RuleLine => ({
  bankAccountId: row.bankAccountId, amountMinor: row.amountMinor, label: row.label, counterpartyName: row.counterpartyName, counterpartyIban: row.counterpartyIban, bankCode: row.bankCode,
});

const asRule = (row: RuleRow): BankRule => ({ id: row.id, name: row.name, position: row.position, active: row.active, conditions: row.conditions, actions: row.actions });

const checkTargets = (organizationId: string | null, rule: Omit<BankRule, "id">) =>
  Effect.gen(function* () {
    const ids = [rule.conditions.bankAccountId, rule.actions.targetBankAccountId].filter((value): value is string => !!value);
    if (ids.length === 0) return;
    const rows = yield* dbTry("banking.rules.accounts", () => getDrizzle().select({ id: bankAccounts.id }).from(bankAccounts)
      .where(and(tenant(bankAccounts.organizationId, organizationId), inArray(bankAccounts.id, ids))));
    if (rows.length !== new Set(ids).size) return yield* fail("BAD_REQUEST", "Compte bancaire de la règle introuvable.");
  });

export const bankRulesService = {
  list: (organizationId: string | null) =>
    dbTry("banking.rules.list", () => getDrizzle().select().from(bankRules).where(tenant(bankRules.organizationId, organizationId)).orderBy(asc(bankRules.position), asc(bankRules.name))),

  activeRules: (organizationId: string | null, executor: Pick<ReturnType<typeof getDrizzle>, "select"> = getDrizzle()) =>
    dbTry("banking.rules.active", () => executor.select().from(bankRules).where(and(tenant(bankRules.organizationId, organizationId), eq(bankRules.active, true))).orderBy(asc(bankRules.position)))
      .pipe(Effect.map((rows) => rows.map((row) => ({ row, rule: asRule(row) })))),

  save: (organizationId: string | null, input: Omit<BankRule, "id"> & { readonly id?: string | null }, actorId: string) =>
    Effect.gen(function* () {
      const rule = yield* validateRule({ ...input, id: input.id ?? undefined }).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      yield* checkTargets(organizationId, rule);
      return yield* dbTransaction("banking.rules.save", (tx) => Effect.gen(function* () {
        const rows = input.id
          ? yield* dbTry("banking.rules.update", () => tx.update(bankRules).set({ ...rule, updatedAt: new Date() }).where(and(eq(bankRules.id, input.id!), tenant(bankRules.organizationId, organizationId))).returning())
          : yield* dbTry("banking.rules.insert", () => tx.insert(bankRules).values({ ...rule, organizationId, createdBy: actorId }).returning());
        const row = rows[0];
        if (!row) return yield* fail("NOT_FOUND", "Règle introuvable.");
        yield* bankingAudit(tx, { actorId, action: input.id ? "banking.rule.update" : "banking.rule.create", resource: "bank_rule", resourceId: row.id, organizationId, metadata: { name: row.name, kind: row.actions.kind } });
        return row;
      }));
    }),

  remove: (organizationId: string | null, id: string, actorId: string) =>
    dbTransaction("banking.rules.remove", (tx) => Effect.gen(function* () {
      const rows = yield* dbTry("banking.rules.delete", () => tx.delete(bankRules).where(and(eq(bankRules.id, id), tenant(bankRules.organizationId, organizationId))).returning({ id: bankRules.id, name: bankRules.name }));
      if (!rows[0]) return yield* fail("NOT_FOUND", "Règle introuvable.");
      yield* bankingAudit(tx, { actorId, action: "banking.rule.delete", resource: "bank_rule", resourceId: id, organizationId, metadata: { name: rows[0].name } });
      return { id };
    })),

  /** Nouvel ordre (liste d'ids) : positions 10, 20, 30… */
  reorder: (organizationId: string | null, ids: readonly string[], actorId: string) =>
    dbTransaction("banking.rules.reorder", (tx) => Effect.gen(function* () {
      for (const [index, id] of ids.slice(0, 500).entries()) {
        yield* dbTry("banking.rules.position", () => tx.update(bankRules).set({ position: (index + 1) * 10 }).where(and(eq(bankRules.id, id), tenant(bankRules.organizationId, organizationId))));
      }
      yield* bankingAudit(tx, { actorId, action: "banking.rule.reorder", resource: "bank_rule", resourceId: ids[0] ?? "-", organizationId, metadata: { count: ids.length } });
      return { count: ids.length };
    })),

  /** Simulation : lignes des 180 derniers jours que la règle classerait (aucune écriture). */
  dryRun: (organizationId: string | null, input: Omit<BankRule, "id">) =>
    Effect.gen(function* () {
      const rule = yield* validateRule(input).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      const rows = yield* dbTry("banking.rules.dryrun", () => getDrizzle().select().from(bankTransactions)
        .where(and(tenant(bankTransactions.organizationId, organizationId), sql`${bankTransactions.bookingDate} >= current_date - 180`))
        .orderBy(desc(bankTransactions.bookingDate)).limit(5000));
      const matches = rows.filter((row) => ruleMatches({ active: true, conditions: rule.conditions }, ruleLineOf(row)));
      return {
        scanned: rows.length, matched: matches.length, open: matches.filter((row) => row.status === "unmatched" || row.status === "suggested").length,
        sample: matches.slice(0, 20).map((row) => ({ id: row.id, bookingDate: row.bookingDate, label: row.label, amountMinor: row.amountMinor, currency: row.currency, status: row.status })),
      };
    }),

  firstMatch: (rules: readonly { row: RuleRow; rule: BankRule }[], line: RuleLine) => {
    const rule = firstMatchingRule(rules.map((entry) => entry.rule), line);
    return rule ? rules.find((entry) => entry.rule.id === rule.id)!.row : null;
  },
};

/**
 * Applique une règle (action `ledger`, `fee`, `transfer` sans ligne opposée, `ignore`) à une ligne
 * verrouillée par l'appelant. Écriture banque ↔ compte de la règle (TVA ventilée), rapprochement
 * `rule`, ligne soldée, compteur de la règle.
 */
export const applyRuleToLine = (tx: DbTransaction, organizationId: string | null, row: TransactionRow, rule: RuleRow, context: ReconciliationContext, actorId: string | null) =>
  Effect.gen(function* () {
    const bump = dbTry("banking.rules.hit", () => tx.update(bankRules).set({ hitCount: sql`${bankRules.hitCount} + 1`, lastHitAt: new Date() }).where(eq(bankRules.id, rule.id)));
    if (rule.actions.kind === "ignore") {
      yield* dbTry("banking.rules.ignore", () => tx.update(bankTransactions).set({ status: "ignored", ruleId: rule.id, suggestion: null, note: rule.actions.label ?? rule.name, updatedAt: new Date() }).where(eq(bankTransactions.id, row.id)));
      yield* bump;
      yield* bankingAudit(tx, { actorId, action: "banking.rule.apply", resource: "bank_transaction", resourceId: row.id, organizationId, metadata: { ruleId: rule.id, kind: "ignore" } });
      return { reconciliationId: null };
    }
    const remaining = row.amountMinor - row.matchedMinor;
    const [account] = yield* dbTry("banking.rules.account", () => tx.select().from(bankAccounts).where(eq(bankAccounts.id, row.bankAccountId)).limit(1));
    if (!account) return yield* fail("NOT_FOUND", "Compte bancaire introuvable.");
    const chartAccount = rule.actions.kind === "fee" && !rule.actions.accountCode ? context.chart.roles.bankFees
      : rule.actions.kind === "transfer" ? context.chart.roles.internalTransfer
      : context.chart.accounts.find((candidate) => candidate.code === rule.actions.accountCode);
    if (!chartAccount) return yield* fail("BAD_REQUEST", `Compte ${rule.actions.accountCode} absent du plan comptable.`);
    const date = postingDate(row.bookingDate, context.lockDate, context.settings.lockedPeriodPolicy);
    if (date === null) return yield* fail("BAD_REQUEST", `Période verrouillée jusqu'au ${context.lockDate}.`);
    const eur = row.matchedMinor === 0 && row.baseAmountMinor !== null ? row.baseAmountMinor : row.currency === "EUR" ? remaining : null;
    if (eur === null) return yield* fail("BAD_REQUEST", "Cours de change du mouvement manquant.");
    const [reconciliation] = yield* dbTry("banking.rules.reconciliation", () => tx.insert(bankReconciliations).values({
      organizationId, status: "applied", mode: "rule", score: 100, date, currency: row.currency, bankTotalMinor: remaining, allocatedMinor: 0, adjustmentMinor: remaining,
      note: rule.actions.label ?? rule.name, ruleId: rule.id, createdBy: actorId,
    }).returning());
    yield* dbTry("banking.rules.line", () => tx.insert(bankReconciliationLines).values({ reconciliationId: reconciliation!.id, transactionId: row.id, amountMinor: remaining }));
    const draft = ruleEntry({
      bank: ledgerAccountOf(account), date, pieceRef: row.bankReference ?? row.endToEndId ?? row.label.slice(0, 60), label: rule.actions.label ?? row.label,
      amountEurMinor: eur, foreign: row.currency !== "EUR" ? { amountMinor: remaining, currency: row.currency } : null, account: chartAccount,
      vatRate: rule.actions.kind === "transfer" ? null : rule.actions.vatRate, config: context.chart, kind: rule.actions.kind === "fee" ? "fee" : "rule",
      auxAccount: rule.actions.auxAccount, auxLabel: rule.actions.auxLabel,
    });
    yield* insertLedgerEntry(tx, draft, { organizationId, bankAccountId: account.id, reconciliationId: reconciliation!.id, transactionId: row.id, actorId });
    yield* dbTry("banking.rules.tx", () => tx.update(bankTransactions).set({ status: "reconciled", matchedMinor: row.amountMinor, ruleId: rule.id, suggestion: null, updatedAt: new Date() }).where(eq(bankTransactions.id, row.id)));
    yield* bump;
    yield* bankingAudit(tx, { actorId, action: "banking.rule.apply", resource: "bank_reconciliation", resourceId: reconciliation!.id, organizationId, metadata: { ruleId: rule.id, kind: rule.actions.kind, amountMinor: remaining } });
    return { reconciliationId: reconciliation!.id };
  });
