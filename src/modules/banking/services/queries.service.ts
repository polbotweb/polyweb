/**
 * Lectures du back-office banking : tableau de bord (soldes, à rapprocher, ancienneté, taux
 * d'automatisation), lignes de relevé filtrées, détail d'un relevé, rapprochements récents.
 * Toutes les lectures sont cloisonnées par organisation et bornées.
 */
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import { TRANSACTION_STATUSES, type TransactionStatus } from "../domain/constants";
import { bankAccounts, bankImports, bankReconciliationLines, bankReconciliations, bankStatements, bankTransactions } from "../schema";
import { bankingToday, tenant } from "./shared";

export interface TransactionFilters {
  readonly bankAccountId?: string | null;
  readonly status?: string | null;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly q?: string | null;
  readonly direction?: "in" | "out" | null;
  readonly limit?: number;
  readonly offset?: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const escapeLike = (value: string) => value.replace(/[%_\\]/g, (c) => `\\${c}`);

const transactionWhere = (organizationId: string | null, filters: TransactionFilters) => {
  const status = filters.status && (TRANSACTION_STATUSES as readonly string[]).includes(filters.status) ? filters.status as TransactionStatus
    : null;
  const q = filters.q?.trim().slice(0, 100);
  return and(
    tenant(bankTransactions.organizationId, organizationId),
    filters.bankAccountId ? eq(bankTransactions.bankAccountId, filters.bankAccountId) : undefined,
    filters.status === "open" ? inArray(bankTransactions.status, ["unmatched", "suggested", "partial"]) : status ? eq(bankTransactions.status, status) : undefined,
    filters.from && DATE.test(filters.from) ? gte(bankTransactions.bookingDate, filters.from) : undefined,
    filters.to && DATE.test(filters.to) ? lte(bankTransactions.bookingDate, filters.to) : undefined,
    filters.direction === "in" ? sql`${bankTransactions.amountMinor} > 0` : filters.direction === "out" ? sql`${bankTransactions.amountMinor} < 0` : undefined,
    q ? or(ilike(bankTransactions.label, `%${escapeLike(q)}%`), ilike(bankTransactions.counterpartyName, `%${escapeLike(q)}%`), eq(bankTransactions.endToEndId, q)) : undefined,
  );
};

export const bankingQueries = {
  transactions: (organizationId: string | null, filters: TransactionFilters = {}) =>
    Effect.gen(function* () {
      const where = transactionWhere(organizationId, filters);
      const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
      const rows = yield* dbTry("banking.tx.list", () => getDrizzle().select({ transaction: bankTransactions, accountLabel: bankAccounts.label }).from(bankTransactions)
        .innerJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.bankAccountId)).where(where)
        .orderBy(desc(bankTransactions.bookingDate), desc(bankTransactions.createdAt)).limit(limit).offset(Math.max(filters.offset ?? 0, 0)));
      const [count] = yield* dbTry("banking.tx.count", () => getDrizzle().select({ n: sql<number>`count(*)::int` }).from(bankTransactions).where(where));
      return { total: count?.n ?? 0, rows };
    }),

  transaction: (organizationId: string | null, id: string) =>
    dbTry("banking.tx.get", () => getDrizzle().select().from(bankTransactions).where(and(eq(bankTransactions.id, id), tenant(bankTransactions.organizationId, organizationId))).limit(1))
      .pipe(Effect.flatMap(([row]) => (row ? Effect.succeed(row) : fail("NOT_FOUND", "Ligne de relevé introuvable.")))),

  statement: (organizationId: string | null, id: string) =>
    Effect.gen(function* () {
      const [statement] = yield* dbTry("banking.statement.get", () => getDrizzle().select({ statement: bankStatements, accountLabel: bankAccounts.label, fileName: bankImports.fileName, format: bankImports.format })
        .from(bankStatements).innerJoin(bankAccounts, eq(bankAccounts.id, bankStatements.bankAccountId)).innerJoin(bankImports, eq(bankImports.id, bankStatements.importId))
        .where(and(eq(bankStatements.id, id), tenant(bankStatements.organizationId, organizationId))).limit(1));
      if (!statement) return yield* fail("NOT_FOUND", "Relevé introuvable.");
      const lines = yield* dbTry("banking.statement.lines", () => getDrizzle().select().from(bankTransactions).where(eq(bankTransactions.statementId, id)).orderBy(bankTransactions.bookingDate).limit(5000));
      return { ...statement, lines };
    }),

  statements: (organizationId: string | null, bankAccountId?: string | null, limit = 50) =>
    dbTry("banking.statements.list", () => getDrizzle().select({ statement: bankStatements, accountLabel: bankAccounts.label }).from(bankStatements)
      .innerJoin(bankAccounts, eq(bankAccounts.id, bankStatements.bankAccountId))
      .where(and(tenant(bankStatements.organizationId, organizationId), bankAccountId ? eq(bankStatements.bankAccountId, bankAccountId) : undefined))
      .orderBy(desc(bankStatements.createdAt)).limit(Math.min(Math.max(limit, 1), 200))),

  reconciliations: (organizationId: string | null, status?: string | null, limit = 50) =>
    dbTry("banking.reconciliations.list", () => getDrizzle().select().from(bankReconciliations)
      .where(and(tenant(bankReconciliations.organizationId, organizationId), status === "applied" || status === "pending_approval" || status === "rejected" || status === "reversed" ? eq(bankReconciliations.status, status) : undefined))
      .orderBy(desc(bankReconciliations.createdAt)).limit(Math.min(Math.max(limit, 1), 200))),

  /** Rapprochements (tous statuts) touchant une ligne de relevé, du plus récent au plus ancien. */
  reconciliationsOfTransaction: (organizationId: string | null, transactionId: string) =>
    dbTry("banking.tx.reconciliations", () => getDrizzle().select({ reconciliation: bankReconciliations, amountMinor: bankReconciliationLines.amountMinor }).from(bankReconciliationLines)
      .innerJoin(bankReconciliations, eq(bankReconciliations.id, bankReconciliationLines.reconciliationId))
      .where(and(eq(bankReconciliationLines.transactionId, transactionId), tenant(bankReconciliations.organizationId, organizationId)))
      .orderBy(desc(bankReconciliations.createdAt)).limit(50)),

  /** Indicateurs du tableau de bord (une requête agrégée par bloc). */
  dashboard: (organizationId: string | null, agingDays: number) =>
    Effect.gen(function* () {
      const db = getDrizzle();
      const today = bankingToday();
      const agingLimit = new Date(Date.parse(`${today}T00:00:00Z`) - agingDays * 86_400_000).toISOString().slice(0, 10);
      const accounts = yield* dbTry("banking.dash.accounts", () => db.select({
        id: bankAccounts.id, label: bankAccounts.label, currency: bankAccounts.currency, iban: bankAccounts.iban, balance: bankAccounts.lastClosingBalanceMinor, balanceDate: bankAccounts.lastClosingDate,
        continuity: bankAccounts.continuityStatus,
        open: sql<number>`(select count(*)::int from bank_transactions t where t.bank_account_id = ${bankAccounts.id} and t.status in ('unmatched','suggested','partial'))`,
      }).from(bankAccounts).where(and(tenant(bankAccounts.organizationId, organizationId), eq(bankAccounts.status, "active"))).orderBy(bankAccounts.label));
      const [counts] = yield* dbTry("banking.dash.counts", () => db.select({
        open: sql<number>`count(*) filter (where ${bankTransactions.status} in ('unmatched','suggested','partial'))::int`,
        suggested: sql<number>`count(*) filter (where ${bankTransactions.status} = 'suggested')::int`,
        pending: sql<number>`count(*) filter (where ${bankTransactions.status} = 'pending_approval')::int`,
        aged: sql<number>`count(*) filter (where ${bankTransactions.status} in ('unmatched','suggested','partial') and ${bankTransactions.bookingDate} < ${agingLimit})::int`,
      }).from(bankTransactions).where(tenant(bankTransactions.organizationId, organizationId)));
      const [automation] = yield* dbTry("banking.dash.automation", () => db.select({
        total: sql<number>`count(*)::int`,
        automatic: sql<number>`count(*) filter (where ${bankReconciliations.mode} in ('auto','rule'))::int`,
      }).from(bankReconciliations).where(and(tenant(bankReconciliations.organizationId, organizationId), eq(bankReconciliations.status, "applied"), sql`${bankReconciliations.createdAt} >= now() - interval '30 days'`)));
      const total = automation?.total ?? 0;
      return {
        accounts, open: counts?.open ?? 0, suggested: counts?.suggested ?? 0, pendingApproval: counts?.pending ?? 0, aged: counts?.aged ?? 0,
        automationRate: total === 0 ? null : Math.round(((automation?.automatic ?? 0) * 100) / total), reconciledLast30: total, today,
      };
    }),
};
