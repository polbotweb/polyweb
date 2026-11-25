/**
 * Suggestions et rapprochement automatique (B5, B12, B13) : règles d'abord (ordre), puis toutes les
 * sources du registre et le moteur de scoring core. Modes (réglage d'organisation, surchargeable par
 * compte) : `off`, `suggest`, `auto_exact` (référence + montant exacts, proposition unique),
 * `auto_threshold` (score ≥ seuil, écart dans la tolérance de perte / profit). Une rupture de
 * continuité suspend l'automatisme si le réglage le demande. Chaque ligne est traitée dans sa propre
 * transaction : un échec laisse la ligne en suggestion, sans bloquer les autres.
 */
import { and, eq, inArray } from "drizzle-orm";
import { Effect, Result } from "effect";
import { getDrizzle } from "@database/drizzle";
import { proposeMatches, reconciliationSources, type Proposal, type ReconCandidate } from "@/core/reconciliation";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import { autoAdjustments } from "../domain/ledger";
import { effectiveAutomationMode, writeOffToleranceFor } from "../domain/settings";
import { bankAccounts, bankTransactions, type StoredSuggestion } from "../schema";
import { reconciliationContext, type ReconciliationContext } from "./context";
import { reconcileInTransaction, reconLineOf, type ReconcileRequest } from "./reconcile.service";
import { applyRuleToLine, bankRulesService, ruleLineOf } from "./rules.service";
import { tenant } from "./shared";

type TransactionRow = typeof bankTransactions.$inferSelect;
const CANDIDATES_PER_SOURCE = 25;

/** Candidats de toutes les sources dans le sens du mouvement (lecture bornée par source). */
export const candidatesFor = (organizationId: string | null, row: TransactionRow, context: Pick<ReconciliationContext, "settings">, search?: string) =>
  Effect.gen(function* () {
    const line = reconLineOf(row);
    const direction = line.amountMinor >= 0 ? "in" : "out";
    const all: ReconCandidate[] = [];
    for (const source of reconciliationSources().filter((candidate) => candidate.direction === direction)) {
      const windowDays = source.key.startsWith("internal-transfer") ? context.settings.transferWindowDays : context.settings.match.dateWindowDays;
      const found = yield* source.findCandidates({ organizationId, line, windowDays, limit: CANDIDATES_PER_SOURCE, ...(search ? { search } : {}) }).pipe(Effect.orElseSucceed(() => [] as readonly ReconCandidate[]));
      all.push(...found);
    }
    return { line, candidates: all };
  });

export const suggestionsFor = (organizationId: string | null, row: TransactionRow, context: Pick<ReconciliationContext, "settings">) =>
  candidatesFor(organizationId, row, context).pipe(Effect.map(({ line, candidates }) => ({ line, candidates, proposals: proposeMatches(line, candidates, context.settings.match) })));

const stored = (proposal: Proposal | undefined): StoredSuggestion | null => proposal ? {
  score: proposal.score, reasons: [...proposal.reasons],
  candidates: proposal.candidates.map((candidate) => ({ source: candidate.source, id: candidate.id, label: candidate.label.slice(0, 160), openMinor: candidate.openMinor, currency: candidate.currency })),
} : null;

/** Requête de rapprochement automatique tirée d'une proposition, ou `null` si elle n'est pas éligible. */
export const autoRequest = (row: TransactionRow, proposal: Proposal, proposals: readonly Proposal[], mode: "auto_exact" | "auto_threshold", context: Pick<ReconciliationContext, "settings">): ReconcileRequest | null => {
  const remaining = row.amountMinor - row.matchedMinor;
  const crossCurrency = proposal.candidates.some((candidate) => (candidate.documentCurrency ?? candidate.currency) !== row.currency);
  const unique = proposals.length === 1 || proposals[1]!.score < proposal.score;
  const allocations = proposal.candidates.map((candidate) => ({ source: candidate.source, targetId: candidate.id, amountMinor: candidate.documentOpenMinor ?? candidate.openMinor }));
  if (mode === "auto_exact") {
    if (!proposal.exact || !unique || (proposal.deltaMinor !== 0 && !crossCurrency)) return null;
    return { transactionIds: [row.id], allocations, adjustments: [] };
  }
  if (proposal.score < context.settings.autoThreshold || !unique) return null;
  if (crossCurrency) return { transactionIds: [row.id], allocations, adjustments: [] };
  const tolerance = writeOffToleranceFor(proposal.expectedMinor, context.settings);
  if (Math.abs(proposal.deltaMinor) > tolerance) return null;
  const { adjustments, partial } = autoAdjustments({ direction: remaining >= 0 ? "in" : "out", deltaMinor: proposal.deltaMinor, writeOffToleranceMinor: tolerance });
  if (partial) return null;
  return { transactionIds: [row.id], allocations, adjustments: adjustments.map((a) => ({ kind: a.kind, bankEffectMinor: a.bankEffectMinor })) };
};

export interface MatchSummary { readonly processed: number; readonly suggested: number; readonly autoMatched: number; readonly ruled: number }

/**
 * Passe les règles et le moteur sur des lignes ouvertes. `allowAuto` : autorise l'automatisme
 * (import, cron) ; sinon suggestions seulement (recalcul manuel).
 */
export const matchTransactions = (organizationId: string | null, transactionIds: readonly string[], options: { readonly allowAuto: boolean; readonly actorId: string | null }) =>
  Effect.gen(function* () {
    if (transactionIds.length === 0) return { processed: 0, suggested: 0, autoMatched: 0, ruled: 0 } satisfies MatchSummary;
    const context = yield* reconciliationContext(organizationId);
    const rules = yield* bankRulesService.activeRules(organizationId);
    const rows = yield* dbTry("banking.match.rows", () => getDrizzle().select().from(bankTransactions)
      .where(and(tenant(bankTransactions.organizationId, organizationId), inArray(bankTransactions.id, [...transactionIds].slice(0, 5000)), inArray(bankTransactions.status, ["unmatched", "suggested"]))));
    const accountIds = [...new Set(rows.map((row) => row.bankAccountId))];
    const accounts = accountIds.length ? yield* dbTry("banking.match.accounts", () => getDrizzle().select().from(bankAccounts).where(inArray(bankAccounts.id, accountIds))) : [];
    let suggested = 0, autoMatched = 0, ruled = 0;
    for (const row of rows) {
      if (row.provisional) continue;
      const account = accounts.find((candidate) => candidate.id === row.bankAccountId);
      const mode = effectiveAutomationMode(context.settings, account?.automationMode);
      const blocked = context.settings.blockAutoOnContinuityBreak && account?.continuityStatus === "mismatch";
      const autoAllowed = options.allowAuto && !blocked && (mode === "auto_exact" || mode === "auto_threshold");
      const ruleRow = bankRulesService.firstMatch(rules, ruleLineOf(row));
      if (ruleRow && row.matchedMinor === 0 && ruleRow.actions.autoValidate && options.allowAuto && !blocked && mode !== "off" && ruleRow.actions.kind !== "transfer") {
        const outcome = yield* Effect.result(dbTransaction("banking.match.rule", (tx) => Effect.gen(function* () {
          const [locked] = yield* dbTry("banking.match.rule.lock", () => tx.select().from(bankTransactions).where(eq(bankTransactions.id, row.id)).limit(1).for("update"));
          if (!locked || (locked.status !== "unmatched" && locked.status !== "suggested")) return false;
          yield* applyRuleToLine(tx, organizationId, locked, ruleRow, context, options.actorId);
          return true;
        })));
        if (Result.isSuccess(outcome) && outcome.success) { ruled += 1; continue; }
      }
      if (mode === "off" && !ruleRow) continue;
      const { proposals } = yield* suggestionsFor(organizationId, row, context);
      const best = proposals[0];
      if (autoAllowed && best) {
        const request = autoRequest(row, best, proposals, mode as "auto_exact" | "auto_threshold", context);
        if (request) {
          const outcome = yield* Effect.result(dbTransaction("banking.match.auto", (tx) => reconcileInTransaction(tx, organizationId, request, { mode: "auto", score: best.score, actorId: options.actorId }, context)));
          if (Result.isSuccess(outcome)) { autoMatched += 1; continue; }
        }
      }
      const suggestion = stored(best);
      if (suggestion || ruleRow) {
        yield* dbTry("banking.match.suggest", () => getDrizzle().update(bankTransactions).set({ status: "suggested", suggestion, ruleId: ruleRow?.id ?? null, updatedAt: new Date() })
          .where(and(eq(bankTransactions.id, row.id), inArray(bankTransactions.status, ["unmatched", "suggested"]))));
        suggested += 1;
      }
    }
    return { processed: rows.length, suggested, autoMatched, ruled } satisfies MatchSummary;
  });
