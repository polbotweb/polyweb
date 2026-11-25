/**
 * Validation et annulation des rapprochements (B6–B11) : une ou plusieurs lignes de relevé contre
 * une ou plusieurs pièces (registre core/reconciliation), écarts affectés (perte / profit, escompte,
 * frais, change, trop-perçu), règlements réels créés dans les modules propriétaires, écriture banque,
 * lettrage, verrouillage de période, approbation des pertes au-delà du seuil. Tout dans UNE
 * transaction ; l'annulation contrepasse (jamais de suppression).
 */
import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { approvalRequests, approvalSteps } from "@/core/approvals/schema";
import { applyDecision, approvalRequired, requiredBands, type ApprovalActor } from "@/core/approvals";
import { nextLetteringCode } from "@/core/accounting/service";
import { recordEvent } from "@/core/events/outbox";
import { baseValueOf, reconciliationSource, type ReconCandidate, type ReconLine } from "@/core/reconciliation";
import { fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { ADJUSTMENT_KINDS, type AdjustmentKind, type ReconciliationMode } from "../domain/constants";
import { adjustmentsEntry, reversalEntry, type AdjustmentInEur } from "../domain/ledger";
import { postingDate } from "../domain/settings";
import { bankAccounts, bankLedgerEntries, bankLedgerLines, bankReconciliationAllocations, bankReconciliationLines, bankReconciliations, bankTransactions, type StoredReconciliationPlan } from "../schema";
import { ledgerAccountOf, reconciliationContext, type ReconciliationContext } from "./context";
import { insertLedgerEntry } from "./ledger.service";
import { notifyBanking } from "./notify.service";
import { bankingSettingsService } from "./settings.service";
import { bankingAudit, bankingToday, tenant } from "./shared";

export interface ReconcileRequest {
  readonly transactionIds: readonly string[];
  readonly allocations: readonly { readonly source: string; readonly targetId: string; readonly amountMinor: number }[];
  readonly adjustments: readonly { readonly kind: AdjustmentKind; readonly bankEffectMinor: number }[];
  readonly note?: string | null;
}

export interface ReconcileOptions {
  readonly mode: ReconciliationMode;
  readonly score?: number | null;
  readonly ruleId?: string | null;
  readonly actorId: string | null;
}

/** Résidu en devise (pièce ≠ mouvement) passé automatiquement en change au-delà duquel il s'agit d'un règlement partiel. */
export const FX_RESIDUAL_MAX_PERCENT = 5;
const MAX_ITEMS = 50;
const OPEN_STATUSES = ["unmatched", "suggested", "partial"] as const;

type TransactionRow = typeof bankTransactions.$inferSelect;

export const reconLineOf = (row: Pick<TransactionRow, "id" | "amountMinor" | "matchedMinor" | "currency" | "bookingDate" | "valueDate" | "label" | "references" | "endToEndId" | "bankReference" | "counterpartyName" | "counterpartyIban">): ReconLine => ({
  id: row.id, amountMinor: row.amountMinor - row.matchedMinor, currency: row.currency, bookingDate: row.bookingDate, valueDate: row.valueDate, label: row.label,
  references: [...new Set([...(row.references ?? []), row.endToEndId, row.bankReference].filter((value): value is string => !!value && value !== "NOTPROVIDED"))],
  counterpartyName: row.counterpartyName, counterpartyIban: row.counterpartyIban,
});

const validateRequest = (request: ReconcileRequest) =>
  Effect.gen(function* () {
    const ids = [...new Set(request.transactionIds)];
    if (ids.length === 0 || ids.length > MAX_ITEMS) return yield* fail("BAD_REQUEST", "Sélectionnez entre 1 et 50 lignes de relevé.");
    if (request.allocations.length > MAX_ITEMS || request.adjustments.length > 10) return yield* fail("BAD_REQUEST", "Trop d'imputations.");
    if (request.allocations.length === 0 && request.adjustments.length === 0) return yield* fail("BAD_REQUEST", "Aucune pièce ni écart à imputer.");
    const keys = new Set<string>();
    for (const allocation of request.allocations) {
      if (!Number.isSafeInteger(allocation.amountMinor) || allocation.amountMinor <= 0) return yield* fail("BAD_REQUEST", "Montant d'imputation invalide.");
      const key = `${allocation.source}:${allocation.targetId}`;
      if (keys.has(key)) return yield* fail("BAD_REQUEST", "Pièce imputée deux fois.");
      keys.add(key);
    }
    for (const adjustment of request.adjustments) {
      if (!(ADJUSTMENT_KINDS as readonly string[]).includes(adjustment.kind)) return yield* fail("BAD_REQUEST", "Nature d'écart invalide.");
      if (!Number.isSafeInteger(adjustment.bankEffectMinor) || adjustment.bankEffectMinor === 0) return yield* fail("BAD_REQUEST", "Montant d'écart invalide.");
    }
    const note = request.note?.trim().slice(0, 500) || null;
    return { ...request, transactionIds: ids, note };
  });

const lockTransactions = (tx: DbTransaction, organizationId: string | null, ids: readonly string[], allowPending: boolean) =>
  Effect.gen(function* () {
    const rows = yield* dbTry("banking.reconcile.lock", () => tx.select().from(bankTransactions)
      .where(and(tenant(bankTransactions.organizationId, organizationId), inArray(bankTransactions.id, [...ids]))).orderBy(bankTransactions.id).for("update"));
    if (rows.length !== ids.length) return yield* fail("NOT_FOUND", "Ligne de relevé introuvable.");
    const allowed: readonly string[] = allowPending ? [...OPEN_STATUSES, "pending_approval"] : OPEN_STATUSES;
    if (rows.some((row) => !allowed.includes(row.status))) return yield* fail("CONFLICT", "Une ligne est déjà rapprochée, ignorée ou en attente d'approbation.");
    if (new Set(rows.map((row) => row.bankAccountId)).size > 1 || new Set(rows.map((row) => row.currency)).size > 1) return yield* fail("BAD_REQUEST", "Les lignes doivent appartenir au même compte et à la même devise.");
    const remaining = rows.map((row) => row.amountMinor - row.matchedMinor);
    if (remaining.some((value) => value === 0) || new Set(remaining.map(Math.sign)).size > 1) return yield* fail("BAD_REQUEST", "Les lignes doivent être de même sens et non soldées.");
    const [account] = yield* dbTry("banking.reconcile.account", () => tx.select().from(bankAccounts)
      .where(and(eq(bankAccounts.id, rows[0]!.bankAccountId), tenant(bankAccounts.organizationId, organizationId))).limit(1));
    if (!account) return yield* fail("NOT_FOUND", "Compte bancaire introuvable.");
    return { rows, account };
  });

/** Plan chiffré d'un rapprochement : montants devise du mouvement et EUR, écart de change, date. */
const preparePlan = (tx: DbTransaction, organizationId: string | null, request: ReconcileRequest & { readonly note: string | null }, context: ReconciliationContext, allowPending: boolean) =>
  Effect.gen(function* () {
    const { rows, account } = yield* lockTransactions(tx, organizationId, request.transactionIds, allowPending);
    const currency = rows[0]!.currency;
    const remaining = rows.map((row) => row.amountMinor - row.matchedMinor);
    const total = remaining.reduce((sum, value) => sum + value, 0);
    const sign = Math.sign(total);
    const direction = sign > 0 ? "in" as const : "out" as const;
    const line = reconLineOf({ ...rows[0]!, amountMinor: total, matchedMinor: 0 });

    const allocations: { source: string; targetId: string; amountMinor: number; currency: string; lineMinor: number; eurMinor: number | null; postsBank: boolean; candidate: ReconCandidate }[] = [];
    for (const allocation of request.allocations) {
      const source = reconciliationSource(allocation.source);
      if (!source) return yield* fail("BAD_REQUEST", `Source de rapprochement inconnue : ${allocation.source}.`);
      if (source.direction !== direction) return yield* fail("BAD_REQUEST", "La pièce n'est pas dans le sens du mouvement.");
      const [candidate] = yield* source.findCandidates({ organizationId, line, windowDays: 3650, ids: [allocation.targetId], limit: 1 });
      if (!candidate || candidate.id !== allocation.targetId) return yield* fail("NOT_FOUND", "Pièce introuvable ou déjà soldée.");
      const documentCurrency = (candidate.documentCurrency ?? candidate.currency).toUpperCase();
      const open = candidate.documentOpenMinor ?? candidate.openMinor;
      if (allocation.amountMinor > open) return yield* fail("BAD_REQUEST", `Imputation supérieure au restant dû (${candidate.label}).`);
      const lineMinor = documentCurrency === currency ? allocation.amountMinor
        : currency === "EUR" ? yield* baseValueOf(allocation.amountMinor, documentCurrency, candidate.baseRate ?? null) : null;
      if (lineMinor === null) return yield* fail("BAD_REQUEST", `Devise de la pièce non convertible vers ${currency} (${candidate.label}).`);
      const eurMinor = yield* baseValueOf(allocation.amountMinor, documentCurrency, candidate.baseRate ?? null);
      allocations.push({ ...allocation, currency: documentCurrency, lineMinor, eurMinor, postsBank: source.postsBank === true, candidate });
    }
    const selfPosting = allocations.some((a) => a.postsBank);
    if (selfPosting && (allocations.length > 1 || request.adjustments.length > 0)) return yield* fail("BAD_REQUEST", "Un virement interne ou un versement se rapproche seul, sans autre pièce ni écart.");

    const adjustments: { kind: AdjustmentKind; bankEffectMinor: number }[] = request.adjustments.map((a) => ({ kind: a.kind, bankEffectMinor: a.bankEffectMinor }));
    const covered = () => sign * allocations.reduce((sum, a) => sum + a.lineMinor, 0) + adjustments.reduce((sum, a) => sum + a.bankEffectMinor, 0);
    let residual = total - covered();
    let matched = total;
    if (residual !== 0) {
      const crossCurrency = allocations.some((a) => a.currency !== currency);
      if (crossCurrency && context.settings.fxAutoPost && Math.abs(residual) * 100 <= Math.abs(total) * FX_RESIDUAL_MAX_PERCENT) {
        adjustments.push({ kind: "fx", bankEffectMinor: residual });
        residual = 0;
      } else if (rows.length === 1 && Math.sign(covered()) === sign && Math.abs(covered()) < Math.abs(total) && !selfPosting) {
        matched = covered();
      } else {
        return yield* fail("BAD_REQUEST", `Écart non affecté : ${residual} (unités mineures ${currency}).`);
      }
    }
    const partial = matched !== total;

    // Contre-valeurs EUR : ligne au cours BCE figé à l'import, pièces au cours figé de la pièce.
    let matchedEur = 0;
    if (partial) {
      const value = yield* baseValueOf(matched, currency, rows[0]!.baseRate);
      if (value === null) return yield* fail("BAD_REQUEST", "Cours de change du mouvement manquant.");
      matchedEur = value;
    } else {
      for (const [index, row] of rows.entries()) {
        const value = yield* baseValueOf(remaining[index]!, currency, row.baseRate);
        if (value === null) return yield* fail("BAD_REQUEST", "Cours de change du mouvement manquant.");
        matchedEur += value;
      }
    }
    const adjustmentsEur: AdjustmentInEur[] = [];
    for (const adjustment of adjustments) {
      const eur = yield* baseValueOf(adjustment.bankEffectMinor, currency, rows[0]!.baseRate);
      if (eur === null) return yield* fail("BAD_REQUEST", "Cours de change du mouvement manquant.");
      adjustmentsEur.push({ ...adjustment, bankEffectEurMinor: eur });
    }
    let fxEur = 0;
    if (!selfPosting) {
      if (allocations.some((a) => a.eurMinor === null)) return yield* fail("BAD_REQUEST", "Cours figé d'une pièce en devise manquant.");
      fxEur = matchedEur - (sign * allocations.reduce((sum, a) => sum + a.eurMinor!, 0) + adjustmentsEur.reduce((sum, a) => sum + a.bankEffectEurMinor, 0));
      if (fxEur !== 0) adjustmentsEur.push({ kind: "fx", bankEffectMinor: 0, bankEffectEurMinor: fxEur });
    }
    const writeOffEur = adjustmentsEur.filter((a) => a.kind === "write_off").reduce((sum, a) => sum + Math.abs(a.bankEffectEurMinor), 0);
    const lastDate = rows.map((row) => row.bookingDate).sort().at(-1)!;
    const date = postingDate(lastDate, context.lockDate, context.settings.lockedPeriodPolicy);
    if (date === null) return yield* fail("BAD_REQUEST", `Période verrouillée jusqu'au ${context.lockDate} : rapprochement refusé (réglage « période verrouillée »).`);
    const shares = partial ? [matched] : remaining;
    return { rows, account, currency, total, sign, direction, matched, matchedEur, partial, shares, allocations, adjustments, adjustmentsEur, writeOffEur, date, note: request.note };
  });

type Plan = Effect.Success<ReturnType<typeof preparePlan>>;

const storedPlan = (request: ReconcileRequest & { readonly note: string | null }, plan: Plan): StoredReconciliationPlan => ({
  transactionIds: [...request.transactionIds],
  allocations: request.allocations.map((a) => ({ source: a.source, targetId: a.targetId, amountMinor: a.amountMinor })),
  // Écarts explicites seulement : le change est recalculé à l'approbation.
  adjustments: plan.adjustments.filter((a, index) => index < request.adjustments.length).map((a) => ({ kind: a.kind, bankEffectMinor: a.bankEffectMinor })),
  note: request.note,
});

/** Passe le plan : règlements dans les modules, écriture banque, lettrage, statuts, audit, événement. */
const applyPlan = (tx: DbTransaction, organizationId: string | null, plan: Plan, context: ReconciliationContext, options: ReconcileOptions, existingId: string | null) =>
  Effect.gen(function* () {
    const values = {
      status: "applied" as const, mode: options.mode, score: options.score ?? null, date: plan.date, currency: plan.currency, bankTotalMinor: plan.matched,
      allocatedMinor: plan.allocations.reduce((sum, a) => sum + a.lineMinor, 0), adjustmentMinor: plan.adjustments.reduce((sum, a) => sum + a.bankEffectMinor, 0),
      note: plan.note, ruleId: options.ruleId ?? null, plan: null,
    };
    const [reconciliation] = existingId
      ? yield* dbTry("banking.reconcile.update", () => tx.update(bankReconciliations).set(values).where(eq(bankReconciliations.id, existingId)).returning())
      : yield* dbTry("banking.reconcile.insert", () => tx.insert(bankReconciliations).values({ ...values, organizationId, createdBy: options.actorId }).returning());
    const id = reconciliation!.id;
    if (!existingId) {
      yield* dbTry("banking.reconcile.lines", () => tx.insert(bankReconciliationLines).values(plan.rows.map((row, index) => ({ reconciliationId: id, transactionId: row.id, amountMinor: plan.shares[index]! }))));
    }
    let code: string | null | undefined;
    const lettering = () => code !== undefined ? Effect.succeed(code)
      : context.chart.letteringEnabled ? nextLetteringCode(tx, organizationId).pipe(Effect.tap((value) => Effect.sync(() => { code = value; }))) : Effect.succeed(null);
    const reference = plan.rows[0]!.endToEndId ?? plan.rows[0]!.bankReference ?? plan.rows[0]!.label.slice(0, 60);
    let aux: { account: string; label: string } | null = null;
    for (const allocation of plan.allocations) {
      const source = reconciliationSource(allocation.source)!;
      const result = yield* source.apply(tx, {
        organizationId, candidateId: allocation.targetId, amountMinor: allocation.amountMinor, currency: allocation.currency, paidAt: plan.date, bankAccountId: plan.account.id,
        reference, reconciliationId: id, lettering, baseAmountMinor: allocation.postsBank ? plan.matchedEur : allocation.eurMinor, returnReason: plan.rows[0]!.returnReason, actorId: options.actorId,
      });
      aux ??= result.aux;
      yield* dbTry("banking.reconcile.allocation", () => tx.insert(bankReconciliationAllocations).values({
        reconciliationId: id, source: allocation.source, targetId: allocation.targetId, reference: result.documentNumber, amountMinor: allocation.amountMinor, currency: allocation.currency, effects: [...result.effects],
      }));
    }
    const needsAuxLettering = plan.adjustmentsEur.some((a) => a.kind === "overpayment" && context.settings.overpaymentTreatment === "advance" && aux);
    const entry = adjustmentsEntry({
      bank: ledgerAccountOf(plan.account), date: plan.date, pieceRef: reference, label: plan.rows[0]!.label, currency: plan.currency,
      adjustments: plan.adjustmentsEur.map((a) => a.kind === "overpayment" && aux ? { ...a, auxAccount: aux.account, auxLabel: aux.label } : a),
      config: context.chart, treatment: context.settings.overpaymentTreatment, lettering: needsAuxLettering ? yield* lettering() : null,
    });
    if (entry) yield* insertLedgerEntry(tx, entry, { organizationId, bankAccountId: plan.account.id, reconciliationId: id, transactionId: plan.rows[0]!.id, actorId: options.actorId });
    if (code) yield* dbTry("banking.reconcile.lettering", () => tx.update(bankReconciliations).set({ letteringCode: code! }).where(eq(bankReconciliations.id, id)));
    for (const [index, row] of plan.rows.entries()) {
      const matchedMinor = row.matchedMinor + plan.shares[index]!;
      yield* dbTry("banking.reconcile.tx", () => tx.update(bankTransactions).set({
        matchedMinor, status: matchedMinor === row.amountMinor ? "reconciled" : "partial", suggestion: null, ruleId: options.ruleId ?? row.ruleId, updatedAt: new Date(),
      }).where(eq(bankTransactions.id, row.id)));
    }
    const metadata = {
      mode: options.mode, transactions: plan.rows.length, allocations: plan.allocations.map((a) => ({ source: a.source, targetId: a.targetId, amountMinor: a.amountMinor, currency: a.currency })),
      adjustments: plan.adjustmentsEur.map((a) => ({ kind: a.kind, eurMinor: a.bankEffectEurMinor })), partial: plan.partial, date: plan.date, lettering: code ?? null,
    };
    yield* bankingAudit(tx, { actorId: options.actorId, action: "banking.reconcile", resource: "bank_reconciliation", resourceId: id, organizationId, metadata });
    yield* recordEvent(tx, "banking.reconciled", { reconciliationId: id, bankAccountId: plan.account.id, amountMinor: plan.matched, currency: plan.currency, mode: options.mode }, { organizationId });
    return { id, status: "applied" as const, partial: plan.partial, lettering: code ?? null, date: plan.date };
  });

/** Ouvre une demande d'approbation (perte au-delà du seuil) : plan stocké, lignes « en attente ». */
const openApproval = (tx: DbTransaction, organizationId: string | null, request: ReconcileRequest & { readonly note: string | null }, plan: Plan, context: ReconciliationContext, options: ReconcileOptions, approval: Effect.Success<ReturnType<typeof bankingSettingsService.getWithPolicy>>) =>
  Effect.gen(function* () {
    if (!options.actorId) return yield* fail("FORBIDDEN", "Une perte soumise à approbation exige un utilisateur.");
    const [reconciliation] = yield* dbTry("banking.reconcile.pending", () => tx.insert(bankReconciliations).values({
      organizationId, status: "pending_approval", mode: options.mode, score: options.score ?? null, date: plan.date, currency: plan.currency, bankTotalMinor: plan.matched,
      allocatedMinor: plan.allocations.reduce((sum, a) => sum + a.lineMinor, 0), adjustmentMinor: plan.adjustments.reduce((sum, a) => sum + a.bankEffectMinor, 0),
      plan: storedPlan(request, plan), note: plan.note, ruleId: options.ruleId ?? null, createdBy: options.actorId,
    }).returning());
    const id = reconciliation!.id;
    yield* dbTry("banking.reconcile.pending.lines", () => tx.insert(bankReconciliationLines).values(plan.rows.map((row, index) => ({ reconciliationId: id, transactionId: row.id, amountMinor: plan.shares[index]! }))));
    const bands = requiredBands(approval.approval, plan.writeOffEur);
    const [approvalRequest] = yield* dbTry("banking.approval.open", () => tx.insert(approvalRequests).values({
      organizationId, module: "banking", resourceType: "write_off", resourceId: id, policyId: approval.policyId, amountMinor: plan.writeOffEur, currency: "EUR", status: "PENDING", requestedBy: options.actorId!,
    }).returning());
    yield* dbTry("banking.approval.steps", () => tx.insert(approvalSteps).values(bands.map((band, index) => ({
      requestId: approvalRequest!.id, level: band.level, requiredRole: band.requiredRole, requiredPermission: band.requiredPermission, status: index === 0 ? "PENDING" as const : "WAITING" as const,
    }))));
    yield* dbTry("banking.reconcile.pending.link", () => tx.update(bankReconciliations).set({ approvalRequestId: approvalRequest!.id }).where(eq(bankReconciliations.id, id)));
    yield* dbTry("banking.reconcile.pending.tx", () => tx.update(bankTransactions).set({ status: "pending_approval", updatedAt: new Date() }).where(inArray(bankTransactions.id, plan.rows.map((row) => row.id))));
    yield* bankingAudit(tx, { actorId: options.actorId, action: "banking.reconcile.request_approval", resource: "bank_reconciliation", resourceId: id, organizationId, metadata: { writeOffEurMinor: plan.writeOffEur } });
    yield* notifyBanking(tx, {
      organizationId, settings: context.settings, kind: "writeOffApproval", resourceType: "bank_reconciliation", resourceId: id,
      data: { amountMinor: plan.writeOffEur, currency: "EUR", label: plan.rows[0]!.label.slice(0, 80) }, dedupeKey: `banking:write-off:${id}`, actorId: options.actorId,
    });
    return { id, status: "pending_approval" as const, partial: plan.partial, lettering: null, date: plan.date };
  });

/** Valide un rapprochement (ou le soumet à approbation si la perte dépasse le seuil de la politique). */
export const reconcileInTransaction = (tx: DbTransaction, organizationId: string | null, input: ReconcileRequest, options: ReconcileOptions, context: ReconciliationContext) =>
  Effect.gen(function* () {
    const request = yield* validateRequest(input);
    const plan = yield* preparePlan(tx, organizationId, request, context, false);
    if (plan.writeOffEur > 0) {
      const approval = yield* bankingSettingsService.getWithPolicy(organizationId);
      if (approvalRequired(approval.approval, plan.writeOffEur)) return yield* openApproval(tx, organizationId, request, plan, context, options, approval);
    }
    return yield* applyPlan(tx, organizationId, plan, context, options, null);
  });

export const reconcile = (organizationId: string | null, input: ReconcileRequest, options: ReconcileOptions) =>
  Effect.gen(function* () {
    const context = yield* reconciliationContext(organizationId);
    return yield* dbTransaction("banking.reconcile", (tx) => reconcileInTransaction(tx, organizationId, input, options, context));
  });

/** Décision sur une perte soumise à approbation (moteur core/approvals, paliers successifs). */
export const decideWriteOff = (organizationId: string | null, reconciliationId: string, actor: ApprovalActor, decision: "APPROVED" | "REJECTED", comment: string | null) =>
  Effect.gen(function* () {
    const context = yield* reconciliationContext(organizationId);
    return yield* dbTransaction("banking.writeoff.decide", (tx) => Effect.gen(function* () {
      const [reconciliation] = yield* dbTry("banking.writeoff.lock", () => tx.select().from(bankReconciliations)
        .where(and(eq(bankReconciliations.id, reconciliationId), tenant(bankReconciliations.organizationId, organizationId))).limit(1).for("update"));
      if (!reconciliation) return yield* fail("NOT_FOUND", "Rapprochement introuvable.");
      if (reconciliation.status !== "pending_approval" || !reconciliation.approvalRequestId || !reconciliation.plan) return yield* fail("BAD_REQUEST", "Ce rapprochement n'est pas en attente d'approbation.");
      if (decision === "APPROVED" && reconciliation.createdBy === actor.userId && !actor.isPlatformAdmin) return yield* fail("FORBIDDEN", "Le demandeur ne peut pas approuver sa propre perte.");
      const steps = yield* dbTry("banking.writeoff.steps", () => tx.select().from(approvalSteps).where(eq(approvalSteps.requestId, reconciliation.approvalRequestId!)));
      const result = yield* applyDecision(steps, actor, decision).pipe(Effect.catch((error) => fail("FORBIDDEN", error.message)));
      const pendingLevel = steps.find((row) => row.status === "PENDING")?.level;
      for (const step of result.steps) {
        const previous = steps.find((row) => row.level === step.level)!;
        if (previous.status === step.status) continue;
        const decided = step.status === "APPROVED" || step.status === "REJECTED";
        yield* dbTry("banking.writeoff.step", () => tx.update(approvalSteps).set({
          status: step.status, decidedBy: decided ? actor.userId : previous.decidedBy, decidedAt: decided ? new Date() : previous.decidedAt, comment: step.level === pendingLevel ? comment : previous.comment,
        }).where(eq(approvalSteps.id, previous.id)));
      }
      yield* dbTry("banking.writeoff.request", () => tx.update(approvalRequests).set({
        status: result.status, comment, decidedAt: result.status === "PENDING" ? null : new Date(),
      }).where(eq(approvalRequests.id, reconciliation.approvalRequestId!)));
      yield* bankingAudit(tx, { actorId: actor.userId, action: `banking.write_off.${result.status.toLowerCase()}`, resource: "bank_reconciliation", resourceId: reconciliationId, organizationId, metadata: { decision, comment } });
      if (result.status === "PENDING") return { id: reconciliationId, status: "pending_approval" as const };
      const lines = yield* dbTry("banking.writeoff.lines", () => tx.select().from(bankReconciliationLines).where(eq(bankReconciliationLines.reconciliationId, reconciliationId)));
      if (result.status === "REJECTED") {
        yield* dbTry("banking.writeoff.reject", () => tx.update(bankReconciliations).set({ status: "rejected" }).where(eq(bankReconciliations.id, reconciliationId)));
        yield* dbTry("banking.writeoff.release", () => tx.update(bankTransactions).set({ status: "unmatched", updatedAt: new Date() })
          .where(and(inArray(bankTransactions.id, lines.map((line) => line.transactionId)), eq(bankTransactions.status, "pending_approval"))));
        return { id: reconciliationId, status: "rejected" as const };
      }
      const stored = reconciliation.plan;
      const request = yield* validateRequest({ transactionIds: stored.transactionIds, allocations: stored.allocations, adjustments: stored.adjustments, note: stored.note });
      const plan = yield* preparePlan(tx, organizationId, request, context, true);
      // Le restant de chaque ligne a été revérifié : les parts enregistrées restent valables.
      const applied = yield* applyPlan(tx, organizationId, plan, context, { mode: reconciliation.mode, score: reconciliation.score, ruleId: reconciliation.ruleId, actorId: reconciliation.createdBy }, reconciliationId);
      return { id: applied.id, status: "applied" as const };
    }));
  });

/**
 * Annule un rapprochement : contrepassation des règlements (sources), des écritures banque, retrait
 * du lettrage, lignes rendues au rapprochement. Date : celle d'origine si la période est ouverte,
 * sinon le premier jour ouvert (une annulation n'est jamais refusée pour période verrouillée).
 */
export const reverseReconciliation = (organizationId: string | null, reconciliationId: string, reason: string, actorId: string) =>
  Effect.gen(function* () {
    const cleanReason = reason.trim().slice(0, 500);
    if (cleanReason.length < 3) return yield* fail("BAD_REQUEST", "Motif d'annulation obligatoire.");
    const context = yield* reconciliationContext(organizationId);
    return yield* dbTransaction("banking.reverse", (tx) => Effect.gen(function* () {
      const [reconciliation] = yield* dbTry("banking.reverse.lock", () => tx.select().from(bankReconciliations)
        .where(and(eq(bankReconciliations.id, reconciliationId), tenant(bankReconciliations.organizationId, organizationId))).limit(1).for("update"));
      if (!reconciliation) return yield* fail("NOT_FOUND", "Rapprochement introuvable.");
      if (reconciliation.status !== "applied") return yield* fail("BAD_REQUEST", "Seul un rapprochement validé peut être annulé.");
      const date = postingDate(reconciliation.date, context.lockDate, "next_open_day")!;
      const allocations = yield* dbTry("banking.reverse.allocations", () => tx.select().from(bankReconciliationAllocations).where(eq(bankReconciliationAllocations.reconciliationId, reconciliationId)));
      for (const allocation of allocations) {
        const source = reconciliationSource(allocation.source);
        if (!source) return yield* fail("BAD_REQUEST", `Source de rapprochement indisponible : ${allocation.source}.`);
        yield* source.reverse(tx, { effects: allocation.effects, candidateId: allocation.targetId, reconciliationId, actorId, date });
      }
      const entries = yield* dbTry("banking.reverse.entries", () => tx.select().from(bankLedgerEntries)
        .where(and(eq(bankLedgerEntries.reconciliationId, reconciliationId), tenant(bankLedgerEntries.organizationId, organizationId))));
      const reversed = new Set(entries.map((entry) => entry.reversalOfId).filter(Boolean));
      for (const entry of entries.filter((row) => row.kind !== "reversal" && !reversed.has(row.id))) {
        const lines = yield* dbTry("banking.reverse.entry.lines", () => tx.select().from(bankLedgerLines).where(eq(bankLedgerLines.entryId, entry.id)).orderBy(bankLedgerLines.position));
        yield* insertLedgerEntry(tx, reversalEntry({ ...entry, lines }, date), { organizationId, bankAccountId: entry.bankAccountId, reconciliationId, transactionId: entry.transactionId, reversalOfId: entry.id, actorId });
      }
      // Le lettrage des écritures d'origine est retiré (lignes 4xx / 58x non soldées).
      if (entries.length) yield* dbTry("banking.reverse.unletter", () => tx.update(bankLedgerLines).set({ lettering: null, letteringDate: null }).where(inArray(bankLedgerLines.entryId, entries.map((entry) => entry.id))));
      const lines = yield* dbTry("banking.reverse.lines", () => tx.select().from(bankReconciliationLines).where(eq(bankReconciliationLines.reconciliationId, reconciliationId)));
      const rows = lines.length ? yield* dbTry("banking.reverse.tx.lock", () => tx.select().from(bankTransactions).where(inArray(bankTransactions.id, lines.map((line) => line.transactionId))).for("update")) : [];
      for (const line of lines) {
        const row = rows.find((candidate) => candidate.id === line.transactionId);
        if (!row) continue;
        const matchedMinor = row.matchedMinor - line.amountMinor;
        yield* dbTry("banking.reverse.tx", () => tx.update(bankTransactions).set({ matchedMinor, status: matchedMinor === 0 ? "unmatched" : "partial", updatedAt: new Date() }).where(eq(bankTransactions.id, row.id)));
      }
      yield* dbTry("banking.reverse.mark", () => tx.update(bankReconciliations).set({ status: "reversed", reversedBy: actorId, reversedAt: new Date(), reversalReason: cleanReason }).where(eq(bankReconciliations.id, reconciliationId)));
      yield* bankingAudit(tx, { actorId, action: "banking.unreconcile", resource: "bank_reconciliation", resourceId: reconciliationId, organizationId, metadata: { reason: cleanReason, date, lettering: reconciliation.letteringCode } });
      yield* recordEvent(tx, "banking.unreconciled", { reconciliationId, date }, { organizationId });
      return { id: reconciliationId, date };
    }));
  });

/** Ignore (ou réintègre) des lignes sans incidence comptable (doublon de banque, ligne d'information). */
export const setIgnored = (organizationId: string | null, transactionIds: readonly string[], ignored: boolean, note: string | null, actorId: string) =>
  dbTransaction("banking.ignore", (tx) => Effect.gen(function* () {
    const ids = [...new Set(transactionIds)].slice(0, 500);
    if (ids.length === 0) return 0;
    const rows = yield* dbTry("banking.ignore.lock", () => tx.select({ id: bankTransactions.id, status: bankTransactions.status, matchedMinor: bankTransactions.matchedMinor }).from(bankTransactions)
      .where(and(tenant(bankTransactions.organizationId, organizationId), inArray(bankTransactions.id, ids))).for("update"));
    const eligible = rows.filter((row) => ignored ? (row.status === "unmatched" || row.status === "suggested") && row.matchedMinor === 0 : row.status === "ignored").map((row) => row.id);
    if (eligible.length === 0) return 0;
    yield* dbTry("banking.ignore.update", () => tx.update(bankTransactions).set({ status: ignored ? "ignored" : "unmatched", suggestion: null, note: ignored ? note?.trim().slice(0, 500) || null : null, updatedAt: new Date() })
      .where(inArray(bankTransactions.id, eligible)));
    yield* bankingAudit(tx, { actorId, action: ignored ? "banking.ignore" : "banking.unignore", resource: "bank_transaction", resourceId: eligible[0]!, organizationId, metadata: { count: eligible.length, ids: eligible.slice(0, 50), note } });
    return eligible.length;
  }));

export const reconciliationDetail = (organizationId: string | null, reconciliationId: string) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const [reconciliation] = yield* dbTry("banking.reconciliation.get", () => db.select().from(bankReconciliations)
      .where(and(eq(bankReconciliations.id, reconciliationId), tenant(bankReconciliations.organizationId, organizationId))).limit(1));
    if (!reconciliation) return yield* fail("NOT_FOUND", "Rapprochement introuvable.");
    const [lines, allocations, entries] = yield* Effect.all([
      dbTry("banking.reconciliation.lines", () => db.select({ line: bankReconciliationLines, transaction: bankTransactions }).from(bankReconciliationLines)
        .innerJoin(bankTransactions, eq(bankTransactions.id, bankReconciliationLines.transactionId)).where(eq(bankReconciliationLines.reconciliationId, reconciliationId))),
      dbTry("banking.reconciliation.allocations", () => db.select().from(bankReconciliationAllocations).where(eq(bankReconciliationAllocations.reconciliationId, reconciliationId))),
      dbTry("banking.reconciliation.entries", () => db.select().from(bankLedgerEntries).where(eq(bankLedgerEntries.reconciliationId, reconciliationId))),
    ]);
    return { reconciliation, lines, allocations, entries, today: bankingToday() };
  });
