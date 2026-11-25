import { Effect, Result } from "effect";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNTING_CONFIG } from "@/core/accounting/chart";
import { csvCell, minorToDecimal, toCsv } from "@/modules/banking/domain/export";
import { gocardlessStatus, gocardlessTransaction } from "@/modules/banking/domain/feeds";
import { accountMatches, checkContinuity, fingerprints, matchesProvisional } from "@/modules/banking/domain/import";
import { adjustmentRole, adjustmentsEntry, autoAdjustments, bankEntry, isBalancedEntry, payoutEntry, reversalEntry, ruleEntry, splitVat, transferEntries } from "@/modules/banking/domain/ledger";
import { transaction } from "@/modules/banking/domain/parsers/types";
import { breakdown, stripeItemType } from "@/modules/banking/domain/payouts";
import { firstMatchingRule, labelMatches, ruleFromLine, validateRule, type BankRule } from "@/modules/banking/domain/rules";
import { DEFAULT_BANKING_SETTINGS, effectiveAutomationMode, effectiveLockDate, endOfMonth, postingDate, resolveBankingSettings, writeOffToleranceFor } from "@/modules/banking/domain/settings";

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(Effect.result(effect));
const config = DEFAULT_ACCOUNTING_CONFIG;
const bank = { account: "512100", accountLabel: "Banque principale", journalCode: "BQ1", journalLabel: "Banque 1" };

describe("banking — dédoublonnage et continuité", () => {
  const tx = (amount: number, ref: string | null = null) => transaction({ bookingDate: "2026-03-31", amountMinor: amount, currency: "EUR", label: "VIR X", bankReference: ref });
  it("distingue deux lignes identiques et stabilise la réimportation", () => {
    const first = fingerprints("acc", [tx(100), tx(100)]);
    expect(first[0]).not.toBe(first[1]);
    expect(fingerprints("acc", [tx(100), tx(100)])).toEqual(first);
    expect(fingerprints("other", [tx(100)])[0]).not.toBe(first[0]);
    expect(fingerprints("acc", [tx(100, "R1")])[0]).toBe(fingerprints("acc", [tx(100, "R1")])[0]);
  });
  it("fusionne une ligne provisoire", () => {
    const p = { amountMinor: 100, currency: "EUR", bookingDate: "2026-03-30", endToEndId: "E1", bankReference: null, label: "x" };
    expect(matchesProvisional({ ...tx(100), endToEndId: "E1" }, p)).toBe(true);
    expect(matchesProvisional({ ...tx(100), endToEndId: "E2" }, p)).toBe(false);
    expect(matchesProvisional(tx(101), p)).toBe(false);
  });
  it("contrôle la continuité", () => {
    const statement = { kind: "statement" as const, openingBalanceMinor: 1000, closingBalanceMinor: 1100, sequence: "43", transactions: [{ amountMinor: 100, provisional: false }] };
    expect(checkContinuity(statement, { closingBalanceMinor: 1000, sequence: "42" }).status).toBe("ok");
    expect(checkContinuity(statement, { closingBalanceMinor: 900, sequence: "42" })).toMatchObject({ status: "mismatch", deltaMinor: 100 });
    expect(checkContinuity(statement, { closingBalanceMinor: 1000, sequence: "40" }).status).toBe("gap");
    expect(checkContinuity({ ...statement, closingBalanceMinor: 1200 }, null).reason).toBe("internal_mismatch");
    expect(checkContinuity({ ...statement, openingBalanceMinor: null }, null).status).toBe("unknown");
    expect(checkContinuity(statement, null).reason).toBe("first");
  });
  it("vérifie le compte du fichier", () => {
    const iban = "FR7630006000011234567890189";
    expect(accountMatches(iban, { iban })).toBe(true);
    expect(accountMatches("300060000112345678901", { iban })).toBe(true);
    expect(accountMatches("FR7610107001011234567890129", { iban })).toBe(false);
    expect(accountMatches(null, { iban })).toBe(true);
  });
});

describe("banking — règles", () => {
  const rule = (over: Partial<BankRule["conditions"]> = {}, position = 1, id = "r1"): BankRule => ({
    id, name: "Frais", position, active: true,
    conditions: { bankAccountId: null, direction: "out", amountMinMinor: null, amountMaxMinor: null, label: { operator: "contains", value: "frais" }, counterpartyIban: null, counterpartyName: null, bankCode: null, ...over },
    actions: { kind: "fee", accountCode: null, vatRate: null, label: null, auxAccount: null, auxLabel: null, targetBankAccountId: null, autoValidate: true },
  });
  const line = { bankAccountId: "a", amountMinor: -1200, label: "FRAIS TENUE DE COMPTE", counterpartyName: null, counterpartyIban: null, bankCode: "ACMT-MDOP-CHRG" };
  it("compare les libellés sans accents ni casse", () => {
    expect(labelMatches("Frais télé", { operator: "contains", value: "TELE" })).toBe(true);
    expect(labelMatches("ABC", { operator: "starts_with", value: "b" })).toBe(false);
    expect(labelMatches("ABC", { operator: "ends_with", value: "bc" })).toBe(true);
    expect(labelMatches("ABC", { operator: "equals", value: "abc" })).toBe(true);
  });
  it("applique la première règle dans l'ordre", () => {
    const rules = [rule({}, 5, "b"), rule({ amountMaxMinor: 1000 }, 1, "a"), rule({ bankCode: "ACMT" }, 2, "c")];
    expect(firstMatchingRule(rules, line)?.id).toBe("c");
    expect(firstMatchingRule([rule({ direction: "in" })], line)).toBeNull();
  });
  it("valide les règles", () => {
    const { id: _id, ...base } = rule();
    expect(Result.isSuccess(run(validateRule(base)))).toBe(true);
    expect(Result.isFailure(run(validateRule({ ...base, conditions: { ...base.conditions, label: null } })))).toBe(true);
    expect(Result.isFailure(run(validateRule({ ...base, actions: { ...base.actions, kind: "ledger", accountCode: "x" } })))).toBe(true);
    expect(Result.isFailure(run(validateRule({ ...base, actions: { ...base.actions, kind: "transfer" } })))).toBe(true);
  });
  it("propose une règle depuis une ligne", () => {
    expect(ruleFromLine(line, rule().actions).conditions.label?.value).toContain("FRAIS");
  });
});

describe("banking — grand livre", () => {
  it("ventile la TVA exactement", () => {
    expect(splitVat(1200, "20")).toEqual({ netMinor: 1000, vatMinor: 200 });
    expect(splitVat(1000, "5.5")).toEqual({ netMinor: 948, vatMinor: 52 });
    expect(splitVat(1000, null)).toEqual({ netMinor: 1000, vatMinor: 0 });
    expect(splitVat(-1200, "20")).toEqual({ netMinor: -1000, vatMinor: -200 });
  });
  it("écrit des écritures toujours équilibrées", () => {
    const fee = ruleEntry({ bank, date: "2026-03-31", pieceRef: "BQ", label: "Frais", amountEurMinor: -1200, foreign: null, account: config.roles.bankFees, vatRate: "20", config, kind: "fee" });
    expect(isBalancedEntry(fee)).toBe(true);
    expect(fee.lines.find((l) => l.account === "512100")?.creditMinor).toBe(1200);
    expect(fee.lines.find((l) => l.account === config.roles.vatDeductible.code)?.debitMinor).toBe(200);
    const entry = bankEntry({ kind: "manual", bank, date: "2026-03-31", pieceRef: "X", label: "x", bankEffectMinor: 500, counterparts: [{ account: config.roles.suspense, amountMinor: 500 }] });
    expect(isBalancedEntry(entry)).toBe(true);
    expect(isBalancedEntry(reversalEntry(entry, "2026-04-01"))).toBe(true);
    expect(reversalEntry(entry, "2026-04-01").lines[0]!.creditMinor).toBe(entry.lines[0]!.debitMinor);
  });
  it("choisit le rôle des ajustements", () => {
    expect(adjustmentRole({ kind: "write_off", bankEffectMinor: -3 }, "suspense")).toBe("writeOffLoss");
    expect(adjustmentRole({ kind: "fx", bankEffectMinor: 3 }, "suspense")).toBe("fxGain");
    expect(adjustmentRole({ kind: "overpayment", bankEffectMinor: 3 }, "advance")).toBe("customerAdvance");
    expect(adjustmentRole({ kind: "overpayment", bankEffectMinor: 3 }, "suspense")).toBe("suspense");
    const entry = adjustmentsEntry({ bank, date: "2026-03-31", pieceRef: "R", label: "Écart", currency: "EUR", config, treatment: "suspense", lettering: "AA", adjustments: [{ kind: "write_off", bankEffectMinor: -3, bankEffectEurMinor: -3 }, { kind: "fee", bankEffectMinor: -150, bankEffectEurMinor: -150 }] });
    expect(entry && isBalancedEntry(entry)).toBe(true);
    expect(adjustmentsEntry({ bank, date: "2026-03-31", pieceRef: "R", label: "x", currency: "EUR", config, treatment: "suspense", lettering: null, adjustments: [] })).toBeNull();
  });
  it("calcule les ajustements automatiques", () => {
    expect(autoAdjustments({ direction: "in", deltaMinor: -50, writeOffToleranceMinor: 100 }).adjustments[0]).toMatchObject({ kind: "write_off", bankEffectMinor: -50 });
    expect(autoAdjustments({ direction: "in", deltaMinor: 500, writeOffToleranceMinor: 100 }).adjustments[0]!.kind).toBe("overpayment");
    expect(autoAdjustments({ direction: "in", deltaMinor: -500, writeOffToleranceMinor: 100 }).partial).toBe(true);
    expect(autoAdjustments({ direction: "out", deltaMinor: 0, writeOffToleranceMinor: 100 }).adjustments).toEqual([]);
  });
  it("écrit virements internes et versements", () => {
    const entries = transferEntries({ from: { ...bank, amountEurMinor: -10000, foreign: null, date: "2026-03-31" }, to: { ...bank, account: "512200", amountEurMinor: 10050, foreign: { amountMinor: 10850, currency: "USD" }, date: "2026-04-01" }, pieceRef: "VI", label: "Virement", config, lettering: "AB" });
    expect(entries).toHaveLength(3);
    for (const e of entries) expect(isBalancedEntry(e)).toBe(true);
    const payout = payoutEntry({ bank, date: "2026-03-31", pieceRef: "po_1", label: "Stripe", netEurMinor: 9710, feeEurMinor: 290, config });
    expect(isBalancedEntry(payout)).toBe(true);
  });
});

describe("banking — réglages", () => {
  it("fusionne les défauts et refuse les valeurs hors bornes", () => {
    expect(Result.isSuccess(run(resolveBankingSettings({})))).toBe(true);
    expect(Result.isSuccess(run(resolveBankingSettings(null)))).toBe(true);
    expect(Result.isFailure(run(resolveBankingSettings({ autoThreshold: 500 })))).toBe(true);
    expect(Result.isFailure(run(resolveBankingSettings({ automationMode: "yolo" })))).toBe(true);
  });
  it("calcule tolérance, mode et verrouillage", () => {
    expect(writeOffToleranceFor(100_000, DEFAULT_BANKING_SETTINGS)).toBe(100);
    expect(writeOffToleranceFor(10_000, DEFAULT_BANKING_SETTINGS)).toBe(50);
    expect(effectiveAutomationMode(DEFAULT_BANKING_SETTINGS, "auto_exact")).toBe("auto_exact");
    expect(effectiveAutomationMode(DEFAULT_BANKING_SETTINGS, null)).toBe(DEFAULT_BANKING_SETTINGS.automationMode);
    expect(endOfMonth("2026-02")).toBe("2026-02-28");
    expect(effectiveLockDate({ lockDate: "2026-01-31", lockAfterFec: true }, "2026-03")).toBe("2026-03-31");
    expect(effectiveLockDate({ lockDate: "2026-01-31", lockAfterFec: false }, "2026-03")).toBe("2026-01-31");
    expect(postingDate("2026-03-15", "2026-03-31", "refuse")).toBeNull();
    expect(postingDate("2026-03-15", "2026-03-31", "next_open_day")).toBe("2026-04-01");
    expect(postingDate("2026-04-15", "2026-03-31", "refuse")).toBe("2026-04-15");
  });
});

describe("banking — export, flux, versements", () => {
  it("neutralise les formules dans les CSV", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-12,50")).toBe("-12,50");
    expect(csvCell(-1250)).toBe("-1250");
    expect(csvCell('a;"b"')).toBe('"a;""b"""');
    expect(toCsv(["a"], [["x"]])).toBe("\uFEFFa\r\nx\r\n");
    expect(minorToDecimal(-1250)).toBe("-12,50");
    expect(minorToDecimal(5)).toBe("0,05");
    expect(minorToDecimal(12, 0)).toBe("12");
  });
  it("convertit les transactions GoCardless", async () => {
    const tx = await Effect.runPromise(gocardlessTransaction({
      transactionId: "T1", bookingDate: "2026-03-31", valueDate: "2026-03-31", transactionAmount: { amount: "-45.90", currency: "EUR" },
      creditorName: "Fournisseur", creditorAccount: { iban: "FR7610107001011234567890129" }, remittanceInformationUnstructured: "Facture FF-1", endToEndId: "FF-1",
      currencyExchange: [{ instructedAmount: { amount: "50.00", currency: "USD" } }],
    }, false));
    expect(tx).toMatchObject({ amountMinor: -4590, counterpartyName: "Fournisseur", endToEndId: "FF-1", bankReference: "T1", originalCurrency: "USD", originalAmountMinor: -5000 });
    expect(Result.isFailure(run(gocardlessTransaction({ transactionAmount: { amount: "x", currency: "EUR" }, bookingDate: "2026-03-31" }, false)))).toBe(true);
    expect(Result.isFailure(run(gocardlessTransaction({ transactionAmount: { amount: "1", currency: "EUR" } }, false)))).toBe(true);
    expect(gocardlessStatus("LN")).toBe("linked");
    expect(gocardlessStatus("EX")).toBe("expired");
    expect(gocardlessStatus("CR")).toBe("pending");
  });
  it("ventile un versement Stripe", () => {
    expect(stripeItemType("charge")).toBe("charge");
    expect(stripeItemType("refund")).toBe("refund");
    expect(stripeItemType("stripe_fee")).toBe("fee");
    expect(stripeItemType("weird")).toBe("other");
    const result = breakdown([
      { externalId: "1", type: "charge", amountMinor: 10000, feeMinor: 290, netMinor: 9710, sourceId: "ch_1" },
      { externalId: "2", type: "refund", amountMinor: -2000, feeMinor: 0, netMinor: -2000, sourceId: "re_1" },
    ]);
    expect(result).toEqual({ grossMinor: 10000, refundMinor: -2000, feeMinor: 290, adjustmentMinor: 0, netMinor: 7710 });
  });
});
