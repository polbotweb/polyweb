/**
 * Grand livre banque (B9–B11, B14) : écriture équilibrée (vérifiée avant insertion), liste filtrée,
 * export CSV protégé contre l'injection de formules. Les écritures sont reprises dans le FEC.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { fail } from "@/lib/effect/action";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import { minorToDecimal, toCsv } from "../domain/export";
import { isBalancedEntry, type LedgerEntryDraft } from "../domain/ledger";
import { exponentOf } from "../domain/parsers/values";
import { bankLedgerEntries, bankLedgerLines } from "../schema";
import { tenant } from "./shared";

export const insertLedgerEntry = (tx: DbTransaction, draft: LedgerEntryDraft, links: {
  readonly organizationId: string | null; readonly bankAccountId: string | null; readonly reconciliationId?: string | null;
  readonly transactionId?: string | null; readonly reversalOfId?: string | null; readonly actorId: string | null; readonly letteringDate?: string | null;
}) =>
  Effect.gen(function* () {
    if (draft.lines.length < 2 || !isBalancedEntry(draft)) return yield* fail("BAD_REQUEST", `Écriture déséquilibrée (${draft.label}).`);
    const [entry] = yield* dbTry("banking.ledger.insert", () => tx.insert(bankLedgerEntries).values({
      organizationId: links.organizationId, bankAccountId: links.bankAccountId, reconciliationId: links.reconciliationId ?? null, transactionId: links.transactionId ?? null,
      reversalOfId: links.reversalOfId ?? null, kind: draft.kind, date: draft.date, journalCode: draft.journalCode, journalLabel: draft.journalLabel,
      pieceRef: draft.pieceRef || draft.label.slice(0, 60), label: draft.label, createdBy: links.actorId,
    }).returning());
    yield* dbTry("banking.ledger.lines", () => tx.insert(bankLedgerLines).values(draft.lines.map((line, position) => ({
      entryId: entry!.id, position, account: line.account, accountLabel: line.accountLabel, auxAccount: line.auxAccount, auxLabel: line.auxLabel, label: line.label,
      debitMinor: line.debitMinor, creditMinor: line.creditMinor, foreignMinor: line.foreignMinor, foreignCurrency: line.foreignCurrency,
      lettering: line.lettering, letteringDate: line.lettering ? links.letteringDate ?? draft.date : null,
    }))));
    return entry!;
  });

export interface LedgerFilters {
  readonly from?: string | null;
  readonly to?: string | null;
  readonly bankAccountId?: string | null;
  readonly kind?: string | null;
  readonly limit?: number;
  readonly offset?: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const whereOf = (organizationId: string | null, filters: LedgerFilters) => and(
  tenant(bankLedgerEntries.organizationId, organizationId),
  filters.from && DATE.test(filters.from) ? gte(bankLedgerEntries.date, filters.from) : undefined,
  filters.to && DATE.test(filters.to) ? lte(bankLedgerEntries.date, filters.to) : undefined,
  filters.bankAccountId ? eq(bankLedgerEntries.bankAccountId, filters.bankAccountId) : undefined,
  filters.kind ? eq(bankLedgerEntries.kind, filters.kind as (typeof bankLedgerEntries.$inferSelect)["kind"]) : undefined,
);

export const bankLedgerService = {
  list: (organizationId: string | null, filters: LedgerFilters = {}) =>
    Effect.gen(function* () {
      const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
      const where = whereOf(organizationId, filters);
      const entries = yield* dbTry("banking.ledger.list", () => getDrizzle().select().from(bankLedgerEntries).where(where)
        .orderBy(desc(bankLedgerEntries.date), desc(bankLedgerEntries.createdAt)).limit(limit).offset(Math.max(filters.offset ?? 0, 0)));
      const [count] = yield* dbTry("banking.ledger.count", () => getDrizzle().select({ n: sql<number>`count(*)::int` }).from(bankLedgerEntries).where(where));
      const lines = entries.length ? yield* dbTry("banking.ledger.list.lines", () => getDrizzle().select().from(bankLedgerLines)
        .where(inArray(bankLedgerLines.entryId, entries.map((entry) => entry.id))).orderBy(asc(bankLedgerLines.entryId), asc(bankLedgerLines.position))) : [];
      const byEntry = Map.groupBy(lines, (line) => line.entryId);
      return { total: count?.n ?? 0, entries: entries.map((entry) => ({ ...entry, lines: byEntry.get(entry.id) ?? [] })) };
    }),

  /** Export CSV (`;`, BOM, formules neutralisées) des lignes d'écritures filtrées (10 000 max). */
  exportCsv: (organizationId: string | null, filters: LedgerFilters = {}) =>
    Effect.gen(function* () {
      const rows = yield* dbTry("banking.ledger.export", () => getDrizzle().select({ entry: bankLedgerEntries, line: bankLedgerLines }).from(bankLedgerLines)
        .innerJoin(bankLedgerEntries, eq(bankLedgerEntries.id, bankLedgerLines.entryId)).where(whereOf(organizationId, filters))
        .orderBy(asc(bankLedgerEntries.date), asc(bankLedgerEntries.createdAt), asc(bankLedgerLines.position)).limit(10_000));
      return toCsv(
        ["Date", "Journal", "Pièce", "Nature", "Compte", "Libellé compte", "Compte auxiliaire", "Libellé", "Débit", "Crédit", "Montant devise", "Devise", "Lettrage"],
        rows.map(({ entry, line }) => [entry.date, entry.journalCode, entry.pieceRef, entry.kind, line.account, line.accountLabel, line.auxAccount, line.label,
          minorToDecimal(line.debitMinor), minorToDecimal(line.creditMinor), line.foreignMinor === null ? "" : minorToDecimal(line.foreignMinor, exponentOf(line.foreignCurrency ?? "EUR") ?? 2), line.foreignCurrency, line.lettering]),
      );
    }),
};
