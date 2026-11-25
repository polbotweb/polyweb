/**
 * FEC et grand livre banque (D1/D2) : sans plan ni écritures banque, la sortie est identique à
 * l'historique ; le grand livre et le lettrage s'ajoutent ; un lettrage désactivé est omis ;
 * une écriture déséquilibrée est refusée ; le plan du tenant remplace les comptes par rôle.
 */
import { describe, expect, it } from "vitest";
import { Effect, Exit } from "effect";
import { DEFAULT_ACCOUNTING_CONFIG, resolveAccountingConfig } from "@/core/accounting/chart";
import { buildFecEntries, parseFecPeriod, type FecDocument, type FecLedgerEntry, type FecPayment } from "@/modules/sales/domain/fec";

const period = Effect.runSync(parseFecPeriod("2026-10"));
const doc: FecDocument = {
  id: "d1", kind: "invoice", number: "FA-2026-00001", issueDate: "2026-10-05", currency: "EUR", customerName: "Client SA", customerVatNumber: null,
  netMinor: 10000, taxMinor: 2000, grossMinor: 12000, lines: [{ netMinor: 10000, ratePercent: "20" }], lettering: { code: "AB", date: "2026-10-20" },
};
const payment: FecPayment = {
  id: "p1", paidAt: "2026-10-20", amountMinor: 12000, currency: "EUR", method: "bank_transfer", reference: "VIR", documentNumber: "FA-2026-00001", customerName: "Client SA", customerVatNumber: null,
  bankAccount: { account: "512100", accountLabel: "Banque Pro", journalCode: "BQ1", journalLabel: "Banque Pro" }, lettering: { code: "AB", date: "2026-10-20" },
};
const fee: FecLedgerEntry = {
  id: "l1", date: "2026-10-21", journalCode: "BQ1", journalLabel: "Banque Pro", pieceRef: "FRAIS-1",
  lines: [
    { account: "627000", accountLabel: "Frais bancaires", label: "Frais", debitMinor: 1250, creditMinor: 0 },
    { account: "512100", accountLabel: "Banque Pro", label: "Frais", debitMinor: 0, creditMinor: 1250 },
  ],
};
const build = (input: Partial<Parameters<typeof buildFecEntries>[0]>) => Effect.runSync(buildFecEntries({ period, documents: [], payments: [], ...input }));

describe("FEC — grand livre banque et lettrage", () => {
  it("sans plan ni grand livre : identique au plan par défaut explicite (sortie historique inchangée)", () => {
    const implicit = build({ documents: [{ ...doc, lettering: null }], payments: [{ ...payment, bankAccount: null, lettering: null }] });
    const explicit = build({ documents: [{ ...doc, lettering: null }], payments: [{ ...payment, bankAccount: null, lettering: null }], chart: DEFAULT_ACCOUNTING_CONFIG });
    expect(implicit).toEqual(explicit);
    const bankLine = implicit.entries.flatMap((entry) => entry.lines).find((line) => line.account.startsWith("512"));
    expect(bankLine?.account).toBe(DEFAULT_ACCOUNTING_CONFIG.roles.bank.code);
    expect(implicit.entries.flatMap((entry) => entry.lines).every((line) => line.lettering === undefined)).toBe(true);
  });

  it("compte et journal du compte bancaire, lettrage des tiers, écritures du grand livre", () => {
    const result = build({ documents: [doc], payments: [payment], ledgerEntries: [fee] });
    expect(result.entries.map((entry) => entry.journalCode)).toContain("BQ1");
    const lettered = result.entries.flatMap((entry) => entry.lines).filter((line) => line.lettering === "AB");
    expect(lettered).toHaveLength(2);
    expect(lettered.every((line) => line.account === DEFAULT_ACCOUNTING_CONFIG.roles.receivable.code && line.letteringDate === "2026-10-20")).toBe(true);
    const feeEntry = result.entries.find((entry) => entry.pieceRef === "FRAIS-1");
    expect(feeEntry?.lines.map((line) => line.account)).toEqual(["627000", "512100"]);
    expect(result.summary.debitMinor).toBe(result.summary.creditMinor);
  });

  it("lettrage désactivé dans le plan du tenant : colonnes vides", () => {
    const chart = { ...DEFAULT_ACCOUNTING_CONFIG, letteringEnabled: false };
    const result = build({ documents: [doc], payments: [payment], chart });
    expect(result.entries.flatMap((entry) => entry.lines).some((line) => line.lettering)).toBe(false);
  });

  it("plan du tenant : le rôle clients pointe vers un autre compte", () => {
    const chart = resolveAccountingConfig({ accounts: [{ code: "411100", label: "Clients France", kind: "asset" }], roleCodes: { receivable: "411100" }, journals: {}, letteringEnabled: true });
    const result = build({ documents: [doc], chart });
    expect(result.entries[0]!.lines.some((line) => line.account === "411100")).toBe(true);
  });

  it("écriture du grand livre déséquilibrée : refus", () => {
    const broken: FecLedgerEntry = { ...fee, lines: [fee.lines[0]!, { ...fee.lines[1]!, creditMinor: 1000 }] };
    expect(Exit.isFailure(Effect.runSyncExit(buildFecEntries({ period, documents: [], payments: [], ledgerEntries: [broken] })))).toBe(true);
  });

  it("hors période : ignorée", () => {
    expect(build({ ledgerEntries: [{ ...fee, date: "2026-11-01" }] }).entries).toHaveLength(0);
  });
});
