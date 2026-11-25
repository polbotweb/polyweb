/**
 * Import de relevés (B1–B4) : empreinte SHA-256 du fichier (réimport = sans effet), fichier brut en
 * stockage privé, lecture (CAMT.053/052/054, MT940/942, CFONB 120, OFX, QIF, CSV), contrôle du
 * compte et de la devise, dédoublonnage ligne à ligne, fusion des lignes provisoires, continuité
 * des soldes, contre-valeur EUR figée au cours BCE, puis règles et rapprochement automatique.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { Effect, Result } from "effect";
import { getDrizzle } from "@database/drizzle";
import { recordEvent } from "@/core/events/outbox";
import { convertAt, rateToDecimal } from "@/core/fx/rate";
import { findRate } from "@/core/fx/service";
import type { CurrencyCode } from "@/core/money";
import { fail } from "@/lib/effect/action";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import { privateStorage } from "@/lib/storage/private";
import type { ImportSource, StatementFormat } from "../domain/constants";
import { accountMatches, checkContinuity, fingerprints, matchesProvisional } from "../domain/import";
import { parseStatementFile, type ParsedFile, type ParsedTransaction } from "../domain/parsers";
import { bankAccounts, bankCsvProfiles, bankImports, bankStatements, bankTransactions } from "../schema";
import { matchTransactions } from "./matching.service";
import { notifyBanking } from "./notify.service";
import { bankingSettingsService } from "./settings.service";
import { bankingAudit, tenant } from "./shared";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const EXTENSIONS: Record<StatementFormat, string> = { camt053: "xml", camt052: "xml", camt054: "xml", mt940: "sta", mt942: "sta", cfonb120: "txt", ofx: "ofx", qif: "qif", csv: "csv" };
const shiftDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export interface ImportInput {
  readonly bankAccountId: string;
  readonly bytes: Uint8Array;
  readonly fileName: string | null;
  readonly format?: StatementFormat | null;
  readonly csvProfileId?: string | null;
  readonly source?: ImportSource;
  /** Fichier déjà lu (flux bancaire) : la lecture est sautée. */
  readonly parsed?: ParsedFile;
}

export interface ImportOutcome {
  readonly importId: string;
  readonly duplicate: boolean;
  readonly statements: number;
  readonly lines: number;
  readonly inserted: number;
  readonly duplicates: number;
  readonly merged: number;
  readonly autoMatched: number;
  readonly continuity: "ok" | "gap" | "mismatch" | "unknown";
}

/** Contre-valeur EUR au cours BCE (ou forçage manuel) du jour de la ligne ; cache par date. */
const baseValues = (organizationId: string | null, currency: string) => {
  const cache = new Map<string, { rate: string; rateValue: Effect.Success<ReturnType<typeof findRate>>["rate"] } | null>();
  return (amountMinor: number, date: string) =>
    Effect.gen(function* () {
      if (currency === "EUR") return { baseAmountMinor: amountMinor, baseRate: null as string | null };
      if (!cache.has(date)) {
        const found = yield* Effect.result(findRate(organizationId, currency as CurrencyCode, "EUR" as CurrencyCode, date));
        cache.set(date, Result.isSuccess(found) && found.success ? { rate: rateToDecimal(found.success.rate), rateValue: found.success.rate } : null);
      }
      const rate = cache.get(date);
      if (!rate) return { baseAmountMinor: null, baseRate: null };
      const converted = yield* Effect.result(convertAt({ amountMinor, currency: currency as CurrencyCode }, "EUR" as CurrencyCode, rate.rateValue, "half-up"));
      return Result.isSuccess(converted) ? { baseAmountMinor: converted.success.amountMinor, baseRate: rate.rate } : { baseAmountMinor: null, baseRate: null };
    });
};

const transactionValues = (organizationId: string | null, accountId: string, statementId: string, fingerprint: string, line: ParsedTransaction, base: { baseAmountMinor: number | null; baseRate: string | null }) => ({
  organizationId, bankAccountId: accountId, statementId, fingerprint, bookingDate: line.bookingDate, valueDate: line.valueDate, amountMinor: line.amountMinor, currency: line.currency,
  originalAmountMinor: line.originalAmountMinor, originalCurrency: line.originalCurrency, baseAmountMinor: base.baseAmountMinor, baseRate: base.baseRate,
  label: line.label.slice(0, 500) || "—", counterpartyName: line.counterpartyName?.slice(0, 140) ?? null, counterpartyIban: line.counterpartyIban, endToEndId: line.endToEndId,
  bankReference: line.bankReference, references: [...line.references].slice(0, 10), bankCode: line.bankCode, returnReason: line.returnReason, provisional: line.provisional,
});

export const importStatement = (organizationId: string | null, input: ImportInput, actorId: string | null) =>
  Effect.gen(function* () {
    const settings = yield* bankingSettingsService.get(organizationId);
    const db = getDrizzle();
    const [account] = yield* dbTry("banking.import.account", () => db.select().from(bankAccounts).where(and(eq(bankAccounts.id, input.bankAccountId), tenant(bankAccounts.organizationId, organizationId))).limit(1));
    if (!account) return yield* fail("NOT_FOUND", "Compte bancaire introuvable.");
    if (account.status !== "active") return yield* fail("BAD_REQUEST", "Ce compte est archivé.");
    const digest = sha256(input.bytes);
    const [existing] = yield* dbTry("banking.import.sha", () => db.select().from(bankImports).where(and(eq(bankImports.bankAccountId, account.id), eq(bankImports.sha256, digest))).limit(1));
    if (existing?.status === "PROCESSED") {
      return { importId: existing.id, duplicate: true, statements: existing.statementCount, lines: existing.lineCount, inserted: 0, duplicates: existing.lineCount, merged: 0, autoMatched: 0, continuity: "unknown" } satisfies ImportOutcome;
    }
    const profileId = input.csvProfileId ?? account.csvProfileId;
    const [profile] = profileId ? yield* dbTry("banking.import.profile", () => db.select().from(bankCsvProfiles).where(and(eq(bankCsvProfiles.id, profileId), tenant(bankCsvProfiles.organizationId, organizationId))).limit(1)) : [];
    const parsed = input.parsed ? Result.succeed(input.parsed) : yield* Effect.result(parseStatementFile({
      bytes: input.bytes, format: input.format ?? account.defaultFormat, csvProfile: profile?.profile ?? null, allowedFormats: settings.allowedFormats, maxBytes: settings.maxFileBytes,
      options: { defaultCurrency: account.currency, maxLines: settings.maxLines, qifDateOrder: settings.qifDateOrder },
    }));
    const fileName = input.fileName?.replace(/[^\p{L}\p{N}._ -]+/gu, "_").slice(0, 120) ?? null;
    if (Result.isFailure(parsed)) {
      const message = parsed.failure.message;
      yield* dbTransaction("banking.import.failed", (tx) => Effect.gen(function* () {
        const [row] = yield* dbTry("banking.import.failed.upsert", () => tx.insert(bankImports).values({
          organizationId, bankAccountId: account.id, source: input.source ?? "upload", format: input.format ?? account.defaultFormat ?? "csv", status: "FAILED", fileName, sha256: digest, sizeBytes: input.bytes.byteLength, error: message.slice(0, 500), createdBy: actorId,
        }).onConflictDoUpdate({ target: [bankImports.bankAccountId, bankImports.sha256], set: { error: message.slice(0, 500), createdAt: new Date() } }).returning());
        yield* bankingAudit(tx, { actorId, action: "banking.import.failed", resource: "bank_import", resourceId: row!.id, organizationId, metadata: { account: account.id, error: message.slice(0, 200) } });
        yield* notifyBanking(tx, { organizationId, settings, kind: "importFailed", resourceType: "bank_import", resourceId: row!.id, data: { account: account.label, fileName, error: message.slice(0, 200) }, dedupeKey: `banking:import-failed:${row!.id}:${Date.now()}`, actorId });
      }));
      return yield* fail("BAD_REQUEST", `Relevé illisible : ${message}`);
    }
    const file = parsed.success;
    for (const statement of file.statements) {
      if (!accountMatches(statement.accountIdentifier, account)) return yield* fail("BAD_REQUEST", "Le relevé ne correspond pas à ce compte (IBAN / numéro de compte).");
      if (statement.currency.toUpperCase() !== account.currency) return yield* fail("BAD_REQUEST", `Devise du relevé (${statement.currency}) différente de celle du compte (${account.currency}).`);
    }
    const storageKey = `banking/${organizationId ?? "platform"}/imports/${account.id}/${digest}.${EXTENSIONS[file.format]}`;
    if (!input.parsed) yield* privateStorage().put(storageKey, input.bytes, { contentType: "application/octet-stream", cacheControl: "private, no-store" });
    const toBase = baseValues(organizationId, account.currency);

    const outcome = yield* dbTransaction("banking.import", (tx) => Effect.gen(function* () {
      const [locked] = yield* dbTry("banking.import.lock", () => tx.select().from(bankAccounts).where(eq(bankAccounts.id, account.id)).limit(1).for("update"));
      if (existing) yield* dbTry("banking.import.retry", () => tx.delete(bankImports).where(eq(bankImports.id, existing.id)));
      const [importRow] = yield* dbTry("banking.import.insert", () => tx.insert(bankImports).values({
        organizationId, bankAccountId: account.id, source: input.source ?? "upload", format: file.format, status: "PROCESSED", fileName, storageKey: input.parsed ? null : storageKey,
        sha256: digest, sizeBytes: input.bytes.byteLength, statementCount: file.statements.length, createdBy: actorId,
      }).returning());
      let lines = 0, inserted = 0, duplicates = 0, merged = 0;
      let continuity: ImportOutcome["continuity"] = "unknown";
      let lastClosing = { balance: locked!.lastClosingBalanceMinor, date: locked!.lastClosingDate, sequence: locked!.lastSequence };
      const insertedIds: string[] = [];
      const returns: string[] = [];
      const statements = [...file.statements].sort((a, b) => (a.toDate ?? "").localeCompare(b.toDate ?? ""));
      for (const statement of statements) {
        lines += statement.transactions.length;
        const previous = lastClosing.balance !== null ? { closingBalanceMinor: lastClosing.balance, sequence: lastClosing.sequence }
          : locked!.openingBalanceMinor !== null ? { closingBalanceMinor: locked!.openingBalanceMinor, sequence: null } : null;
        const check = statement.kind === "statement" && (!lastClosing.date || !statement.toDate || statement.toDate > lastClosing.date)
          ? checkContinuity(statement, previous) : { status: "unknown" as const, deltaMinor: 0, reason: "no_balance" as const };
        if (check.status === "mismatch" || check.status === "gap") continuity = check.status;
        else if (check.status === "ok" && continuity === "unknown") continuity = "ok";
        const [statementRow] = yield* dbTry("banking.import.statement", () => tx.insert(bankStatements).values({
          organizationId, bankAccountId: account.id, importId: importRow!.id, kind: statement.kind, externalId: statement.externalId, sequence: statement.sequence,
          fromDate: statement.fromDate, toDate: statement.toDate, openingBalanceMinor: statement.openingBalanceMinor, closingBalanceMinor: statement.closingBalanceMinor,
          currency: statement.currency.toUpperCase(), lineCount: statement.transactions.length, continuityStatus: check.status, continuityDeltaMinor: check.deltaMinor,
        }).returning());
        const prints = fingerprints(account.id, statement.transactions);
        const known = prints.length ? new Set((yield* dbTry("banking.import.known", () => tx.select({ fingerprint: bankTransactions.fingerprint }).from(bankTransactions)
          .where(and(eq(bankTransactions.bankAccountId, account.id), inArray(bankTransactions.fingerprint, prints))))).map((row) => row.fingerprint)) : new Set<string>();
        const dates = statement.transactions.map((line) => line.bookingDate).sort();
        const provisionals = dates.length && statement.transactions.some((line) => !line.provisional) ? yield* dbTry("banking.import.provisional", () => tx.select().from(bankTransactions)
          .where(and(eq(bankTransactions.bankAccountId, account.id), eq(bankTransactions.provisional, true), gte(bankTransactions.bookingDate, shiftDays(dates[0]!, -3)), lte(bankTransactions.bookingDate, shiftDays(dates.at(-1)!, 3))))) : [];
        const usedProvisional = new Set<string>();
        const batch: ReturnType<typeof transactionValues>[] = [];
        for (const [index, line] of statement.transactions.entries()) {
          const fingerprint = prints[index]!;
          if (known.has(fingerprint)) { duplicates += 1; continue; }
          known.add(fingerprint);
          const base = yield* toBase(line.amountMinor, line.bookingDate);
          if (!line.provisional) {
            const provisional = provisionals.find((row) => !usedProvisional.has(row.id) && matchesProvisional(line, row));
            if (provisional) {
              usedProvisional.add(provisional.id);
              yield* dbTry("banking.import.merge", () => tx.update(bankTransactions).set({ ...transactionValues(organizationId, account.id, statementRow!.id, fingerprint, line, base), status: provisional.status, updatedAt: new Date() }).where(eq(bankTransactions.id, provisional.id)));
              merged += 1;
              continue;
            }
          }
          batch.push(transactionValues(organizationId, account.id, statementRow!.id, fingerprint, line, base));
          if (line.returnReason && line.amountMinor > 0) returns.push(line.endToEndId ?? line.label.slice(0, 40));
        }
        for (let offset = 0; offset < batch.length; offset += 500) {
          const rows = yield* dbTry("banking.import.lines", () => tx.insert(bankTransactions).values(batch.slice(offset, offset + 500)).onConflictDoNothing({ target: [bankTransactions.bankAccountId, bankTransactions.fingerprint] }).returning({ id: bankTransactions.id }));
          inserted += rows.length;
          duplicates += batch.slice(offset, offset + 500).length - rows.length;
          insertedIds.push(...rows.map((row) => row.id));
        }
        if (statement.kind === "statement" && statement.closingBalanceMinor !== null && statement.toDate && (!lastClosing.date || statement.toDate >= lastClosing.date)) {
          lastClosing = { balance: statement.closingBalanceMinor, date: statement.toDate, sequence: statement.sequence };
        }
      }
      yield* dbTry("banking.import.account.update", () => tx.update(bankAccounts).set({
        lastClosingBalanceMinor: lastClosing.balance, lastClosingDate: lastClosing.date, lastSequence: lastClosing.sequence,
        ...(continuity !== "unknown" ? { continuityStatus: continuity } : {}), updatedAt: new Date(),
      }).where(eq(bankAccounts.id, account.id)));
      yield* dbTry("banking.import.counts", () => tx.update(bankImports).set({ lineCount: lines, insertedCount: inserted, duplicateCount: duplicates, mergedCount: merged }).where(eq(bankImports.id, importRow!.id)));
      yield* bankingAudit(tx, { actorId, action: "banking.import", resource: "bank_import", resourceId: importRow!.id, organizationId, metadata: { account: account.id, format: file.format, lines, inserted, duplicates, merged, continuity, sha256: digest } });
      yield* recordEvent(tx, "banking.imported", { importId: importRow!.id, bankAccountId: account.id, inserted, continuity }, { organizationId });
      return { importId: importRow!.id, lines, inserted, duplicates, merged, continuity, insertedIds, returns };
    }));

    const matched = yield* matchTransactions(organizationId, outcome.insertedIds, { allowAuto: true, actorId }).pipe(Effect.orElseSucceed(() => ({ processed: 0, suggested: 0, autoMatched: 0, ruled: 0 })));
    const autoMatched = matched.autoMatched + matched.ruled;
    yield* dbTransaction("banking.import.notify", (tx) => Effect.gen(function* () {
      if (autoMatched) yield* dbTry("banking.import.auto", () => tx.update(bankImports).set({ autoMatchedCount: autoMatched }).where(eq(bankImports.id, outcome.importId)));
      yield* notifyBanking(tx, { organizationId, settings, kind: "importDone", resourceType: "bank_import", resourceId: outcome.importId, data: { account: account.label, inserted: outcome.inserted, autoMatched }, dedupeKey: `banking:import:${outcome.importId}`, actorId });
      if (outcome.continuity === "mismatch" || outcome.continuity === "gap") {
        yield* notifyBanking(tx, { organizationId, settings, kind: "continuityBreak", resourceType: "bank_account", resourceId: account.id, data: { account: account.label, status: outcome.continuity }, dedupeKey: `banking:continuity:${outcome.importId}` });
      }
      if (outcome.returns.length) {
        yield* notifyBanking(tx, { organizationId, settings, kind: "sepaReturn", resourceType: "bank_import", resourceId: outcome.importId, data: { account: account.label, count: outcome.returns.length }, dedupeKey: `banking:returns:${outcome.importId}` });
      }
    }));
    return { importId: outcome.importId, duplicate: false, statements: file.statements.length, lines: outcome.lines, inserted: outcome.inserted, duplicates: outcome.duplicates, merged: outcome.merged, autoMatched, continuity: outcome.continuity } satisfies ImportOutcome;
  });

/** Historique des imports (filtrable par compte). */
export const listImports = (organizationId: string | null, bankAccountId?: string | null, limit = 50) =>
  dbTry("banking.imports.list", () => getDrizzle().select({ import: bankImports, accountLabel: bankAccounts.label }).from(bankImports)
    .innerJoin(bankAccounts, eq(bankAccounts.id, bankImports.bankAccountId))
    .where(and(tenant(bankImports.organizationId, organizationId), bankAccountId ? eq(bankImports.bankAccountId, bankAccountId) : undefined))
    .orderBy(desc(bankImports.createdAt)).limit(Math.min(Math.max(limit, 1), 200)));
