/**
 * Sources de rapprochement propres au module banking (registre core/reconciliation) :
 * - `internal-transfer` : ligne de sens opposé sur un autre compte de l'organisation (fenêtre
 *   réglable) ; deux écritures via le compte de virements internes (580), lettrées ensemble, écart
 *   de contre-valeur en change ; la ligne opposée est rapprochée dans le même rapprochement ;
 * - `stripe-payout` (encaissement) : versement Stripe synchronisé ; banque (net) + commissions =
 *   compte d'encaissement carte (brut), si bien que les règlements carte des ventes se soldent.
 * Ces sources passent elles-mêmes l'écriture côté banque (`postsBank`).
 */
import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { accountingConfig } from "@/core/accounting/service";
import { baseValueOf, registerReconciliationSource, type CandidateQuery, type ReconCandidate, type ReconciliationSource } from "@/core/reconciliation";
import { fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import { payoutEntry, transferEntries } from "./domain/ledger";
import { bankAccounts, bankPayouts, bankReconciliationLines, bankTransactions } from "./schema";
import { ledgerAccountOf } from "./services/context";
import { insertLedgerEntry } from "./services/ledger.service";
import { tenant } from "./services/shared";

const shiftDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const TRANSFER_WINDOW_MAX = 30;

const primaryLine = (tx: DbTransaction, reconciliationId: string) =>
  Effect.gen(function* () {
    const [row] = yield* dbTry("banking.recon.primary", () => tx.select({ transaction: bankTransactions, share: bankReconciliationLines.amountMinor }).from(bankReconciliationLines)
      .innerJoin(bankTransactions, eq(bankTransactions.id, bankReconciliationLines.transactionId))
      .where(eq(bankReconciliationLines.reconciliationId, reconciliationId)).limit(1));
    if (!row) return yield* fail("BAD_REQUEST", "Rapprochement sans ligne de relevé.");
    return row;
  });

const accountOf = (tx: DbTransaction | ReturnType<typeof getDrizzle>, id: string, organizationId: string | null) =>
  dbTry("banking.recon.account", () => tx.select().from(bankAccounts).where(and(eq(bankAccounts.id, id), tenant(bankAccounts.organizationId, organizationId))).limit(1))
    .pipe(Effect.flatMap(([row]) => (row ? Effect.succeed(row) : fail("NOT_FOUND", "Compte bancaire introuvable."))));

const transferSource = (direction: "in" | "out"): ReconciliationSource => ({
  key: direction === "out" ? "internal-transfer" : "internal-transfer-in",
  direction,
  postsBank: true,
  findCandidates: (query: CandidateQuery) =>
    Effect.gen(function* () {
      const db = getDrizzle();
      const [line] = yield* dbTry("banking.transfer.line", () => db.select().from(bankTransactions).where(and(eq(bankTransactions.id, query.line.id), tenant(bankTransactions.organizationId, query.organizationId))).limit(1));
      if (!line) return [];
      const window = Math.min(Math.max(query.windowDays, 0), TRANSFER_WINDOW_MAX);
      const rows = yield* dbTry("banking.transfer.candidates", () => db.select({ transaction: bankTransactions, account: bankAccounts }).from(bankTransactions)
        .innerJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.bankAccountId))
        .where(and(
          tenant(bankTransactions.organizationId, query.organizationId), ne(bankTransactions.bankAccountId, line.bankAccountId),
          inArray(bankTransactions.status, ["unmatched", "suggested"]), eq(bankTransactions.matchedMinor, 0),
          direction === "out" ? sql`${bankTransactions.amountMinor} > 0` : sql`${bankTransactions.amountMinor} < 0`,
          query.ids?.length ? inArray(bankTransactions.id, [...query.ids]) : and(gte(bankTransactions.bookingDate, shiftDays(line.bookingDate, -window)), lte(bankTransactions.bookingDate, shiftDays(line.bookingDate, window))),
        )).orderBy(sql`abs(abs(${bankTransactions.amountMinor}) - ${Math.abs(query.line.amountMinor)})`, desc(bankTransactions.bookingDate)).limit(query.limit));
      return rows.flatMap(({ transaction, account }): ReconCandidate[] => {
        const same = transaction.currency === query.line.currency;
        if (same && Math.abs(transaction.amountMinor) !== Math.abs(query.line.amountMinor) && !query.ids?.length) return [];
        return [{
          source: direction === "out" ? "internal-transfer" : "internal-transfer-in", id: transaction.id, direction,
          openMinor: same ? Math.abs(transaction.amountMinor) : Math.abs(query.line.amountMinor), currency: query.line.currency,
          ...(same ? {} : { originalMinor: Math.abs(transaction.amountMinor), originalCurrency: transaction.currency }),
          date: transaction.bookingDate, references: [transaction.endToEndId ?? "", transaction.bankReference ?? ""].filter(Boolean),
          counterpartyName: account.label, counterpartyIbans: account.iban ? [account.iban] : [], groupKey: null,
          label: `Virement interne — ${account.label} (${transaction.bookingDate})`, baseRate: null,
          documentOpenMinor: Math.abs(query.line.amountMinor), documentCurrency: query.line.currency,
        }];
      });
    }),
  apply: (tx, input) =>
    Effect.gen(function* () {
      const { transaction: primary, share } = yield* primaryLine(tx, input.reconciliationId);
      const [counterpart] = yield* dbTry("banking.transfer.lock", () => tx.select().from(bankTransactions)
        .where(and(eq(bankTransactions.id, input.candidateId), tenant(bankTransactions.organizationId, input.organizationId))).limit(1).for("update"));
      if (!counterpart || counterpart.bankAccountId === primary.bankAccountId || counterpart.matchedMinor !== 0 || !["unmatched", "suggested"].includes(counterpart.status)) return yield* fail("CONFLICT", "La ligne opposée n'est plus disponible.");
      if (Math.sign(counterpart.amountMinor) === Math.sign(share)) return yield* fail("BAD_REQUEST", "Un virement interne associe un débit et un crédit.");
      if (counterpart.currency === primary.currency && Math.abs(counterpart.amountMinor) !== Math.abs(share)) return yield* fail("BAD_REQUEST", "Montants du virement interne différents.");
      const primaryAccount = yield* accountOf(tx, primary.bankAccountId, input.organizationId);
      const otherAccount = yield* accountOf(tx, counterpart.bankAccountId, input.organizationId);
      const primaryEur = input.baseAmountMinor ?? (yield* baseValueOf(share, primary.currency, primary.baseRate));
      const otherEur = yield* baseValueOf(counterpart.amountMinor, counterpart.currency, counterpart.baseRate);
      if (primaryEur === null || otherEur === null) return yield* fail("BAD_REQUEST", "Cours de change manquant pour le virement interne.");
      const config = yield* accountingConfig(input.organizationId, tx);
      const lettering = yield* input.lettering();
      const leg = (account: typeof primaryAccount, row: typeof primary, amount: number, eur: number) => ({
        ...ledgerAccountOf(account), amountEurMinor: eur, date: input.paidAt > row.bookingDate ? input.paidAt : row.bookingDate,
        foreign: row.currency !== "EUR" ? { amountMinor: amount, currency: row.currency } : null,
      });
      const outgoing = share < 0 ? leg(primaryAccount, primary, share, primaryEur) : leg(otherAccount, counterpart, counterpart.amountMinor, otherEur);
      const incoming = share < 0 ? leg(otherAccount, counterpart, counterpart.amountMinor, otherEur) : leg(primaryAccount, primary, share, primaryEur);
      const drafts = transferEntries({ from: outgoing, to: incoming, pieceRef: input.reference, label: `Virement interne ${primaryAccount.label} / ${otherAccount.label}`, config, lettering });
      const effects: { table: string; id: string }[] = [];
      // [sortie, entrée, change éventuel (passé sur le compte d'arrivée)].
      for (const [index, draft] of drafts.entries()) {
        const isPrimary = share < 0 ? index === 0 : index !== 0;
        const entry = yield* insertLedgerEntry(tx, draft, {
          organizationId: input.organizationId, bankAccountId: isPrimary ? primaryAccount.id : otherAccount.id, reconciliationId: input.reconciliationId,
          transactionId: isPrimary ? primary.id : counterpart.id, actorId: input.actorId,
        });
        effects.push({ table: "bank_ledger_entries", id: entry.id });
      }
      yield* dbTry("banking.transfer.line", () => tx.insert(bankReconciliationLines).values({ reconciliationId: input.reconciliationId, transactionId: counterpart.id, amountMinor: counterpart.amountMinor }));
      yield* dbTry("banking.transfer.counterpart", () => tx.update(bankTransactions).set({ matchedMinor: counterpart.amountMinor, status: "reconciled", suggestion: null, updatedAt: new Date() }).where(eq(bankTransactions.id, counterpart.id)));
      effects.push({ table: "bank_transactions", id: counterpart.id });
      return { paymentId: null, settled: true, documentNumber: `${otherAccount.label} ${counterpart.bookingDate}`.slice(0, 80), effects, aux: null };
    }),
  // Écritures et lignes (y compris la ligne opposée) sont contrepassées / rendues par le service.
  reverse: () => Effect.void,
});

const payoutSource: ReconciliationSource = {
  key: "stripe-payout",
  direction: "in",
  postsBank: true,
  findCandidates: (query) =>
    Effect.gen(function* () {
      const db = getDrizzle();
      const rows = yield* dbTry("banking.payout.candidates", () => db.select().from(bankPayouts).where(and(
        tenant(bankPayouts.organizationId, query.organizationId), isNull(bankPayouts.reconciliationId), inArray(bankPayouts.status, ["paid", "in_transit"]),
        sql`upper(${bankPayouts.currency}) = ${query.line.currency.toUpperCase()}`, sql`${bankPayouts.amountMinor} > 0`,
        query.ids?.length ? inArray(bankPayouts.id, [...query.ids]) : undefined,
      )).orderBy(sql`abs(${bankPayouts.amountMinor} - ${Math.abs(query.line.amountMinor)})`, desc(bankPayouts.arrivalDate)).limit(query.limit));
      return rows.map((payout): ReconCandidate => ({
        source: "stripe-payout", id: payout.id, direction: "in", openMinor: payout.amountMinor, currency: query.line.currency, date: payout.arrivalDate,
        references: [payout.externalId], counterpartyName: "Stripe", counterpartyIbans: [], groupKey: null,
        label: `Versement Stripe ${payout.externalId} (${payout.arrivalDate})`, baseRate: null, documentOpenMinor: payout.amountMinor, documentCurrency: query.line.currency,
      }));
    }),
  apply: (tx, input) =>
    Effect.gen(function* () {
      const [payout] = yield* dbTry("banking.payout.lock", () => tx.select().from(bankPayouts)
        .where(and(eq(bankPayouts.id, input.candidateId), tenant(bankPayouts.organizationId, input.organizationId))).limit(1).for("update"));
      if (!payout || payout.reconciliationId) return yield* fail("CONFLICT", "Versement déjà rapproché.");
      if (payout.amountMinor !== input.amountMinor) return yield* fail("BAD_REQUEST", "Le montant du versement diffère de la ligne de relevé.");
      const { transaction: primary } = yield* primaryLine(tx, input.reconciliationId);
      const account = yield* accountOf(tx, primary.bankAccountId, input.organizationId);
      const netEur = input.baseAmountMinor ?? payout.amountMinor;
      const feeEur = payout.amountMinor === 0 ? 0 : Math.round((payout.feeMinor * netEur) / payout.amountMinor);
      const config = yield* accountingConfig(input.organizationId, tx);
      const entry = yield* insertLedgerEntry(tx, payoutEntry({ bank: ledgerAccountOf(account), date: input.paidAt, pieceRef: payout.externalId, label: `Versement Stripe ${payout.externalId}`, netEurMinor: netEur, feeEurMinor: feeEur, config }), {
        organizationId: input.organizationId, bankAccountId: account.id, reconciliationId: input.reconciliationId, transactionId: primary.id, actorId: input.actorId,
      });
      yield* dbTry("banking.payout.mark", () => tx.update(bankPayouts).set({ reconciliationId: input.reconciliationId, status: "reconciled", updatedAt: new Date() }).where(eq(bankPayouts.id, payout.id)));
      return { paymentId: null, settled: true, documentNumber: payout.externalId, effects: [{ table: "bank_ledger_entries", id: entry.id }, { table: "bank_payouts", id: payout.id }], aux: null };
    }),
  reverse: (tx, input) =>
    Effect.gen(function* () {
      for (const effect of input.effects.filter((e) => e.table === "bank_payouts")) {
        yield* dbTry("banking.payout.unmark", () => tx.update(bankPayouts).set({ reconciliationId: null, status: "paid", updatedAt: new Date() }).where(eq(bankPayouts.id, effect.id)));
      }
    }),
};

export const registerBankingReconciliation = (): void => {
  registerReconciliationSource(transferSource("out"));
  registerReconciliationSource(transferSource("in"));
  registerReconciliationSource(payoutSource);
};
