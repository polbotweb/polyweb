import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Effect, Result } from "effect";
import { describe, expect, it } from "vitest";
import { STATEMENT_FORMATS } from "@/modules/banking/domain/constants";
import { CSV_PRESETS, DEFAULT_CSV_PROFILE, detectFormat, parseStatementFile, previewCsv, validateCsvProfile, type CsvProfile } from "@/modules/banking/domain/parsers";
import { cfonbAmount } from "@/modules/banking/domain/parsers/cfonb";
import { csvRows } from "@/modules/banking/domain/parsers/csv";
import { parseInfo86 } from "@/modules/banking/domain/parsers/mt940";
import { canonicalAmount, decimalToMinor, fullYear } from "@/modules/banking/domain/parsers/values";

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, "../../fixtures/banking", name)));
const options = { defaultCurrency: "EUR", maxLines: 1000, qifDateOrder: "DMY" as const };
const parse = (name: string, extra: { csvProfile?: CsvProfile; format?: (typeof STATEMENT_FORMATS)[number] } = {}) =>
  Effect.runPromise(parseStatementFile({ bytes: fixture(name), allowedFormats: STATEMENT_FORMATS, maxBytes: 1_000_000, options, ...extra }));
const parseText = (text: string, extra: { csvProfile?: CsvProfile; maxBytes?: number; maxLines?: number } = {}) =>
  Effect.runPromise(Effect.result(parseStatementFile({ bytes: new TextEncoder().encode(text), allowedFormats: STATEMENT_FORMATS, maxBytes: extra.maxBytes ?? 1_000_000, options: { ...options, maxLines: extra.maxLines ?? 1000 }, csvProfile: extra.csvProfile })));

describe("banking — valeurs", () => {
  it("convertit les montants décimaux sans flottant", () => {
    expect(decimalToMinor("1200.00", 2)).toBe(120000);
    expect(decimalToMinor("-0.5", 2)).toBe(-50);
    expect(decimalToMinor("1.234", 2)).toBeNull();
    expect(decimalToMinor("12", 0)).toBe(12);
    expect(canonicalAmount("1 200,50", ",")).toBe("1200.50");
    expect(canonicalAmount("1.200,50", ",")).toBe("1200.50");
    expect(canonicalAmount("abc", ".")).toBeNull();
  });
  it("décode le signe CFONB (overpunch)", () => {
    expect(cfonbAmount("0000000012000{")?.value).toBe(120000n);
    expect(cfonbAmount("0000000000120}")?.value).toBe(-1200n);
    expect(cfonbAmount("000000000012A")).toBeNull();
  });
  it("résout les années sur deux chiffres", () => {
    expect(fullYear(26, new Date("2026-01-01"))).toBe(2026);
    expect(fullYear(99, new Date("2026-01-01"))).toBe(1999);
  });
});

describe("banking — détection de format", () => {
  it.each([
    ["camt053-v02.xml", "camt053"], ["camt053-v08.xml", "camt053"], ["camt054.xml", "camt054"],
    ["mt940-de.sta", "mt940"], ["mt940-fr.sta", "mt940"], ["mt942.sta", "mt942"],
    ["cfonb120.txt", "cfonb120"], ["ofx1.ofx", "ofx"], ["ofx2.ofx", "ofx"], ["bank.qif", "qif"], ["generic.csv", "csv"],
  ])("%s → %s", (name, format) => {
    expect(detectFormat(new TextDecoder("latin1").decode(fixture(name)))).toBe(format);
  });
});

describe("banking — CAMT", () => {
  it("lit un camt.053.001.02 complet (lot SEPA, retour, devise d'origine)", async () => {
    const file = await parse("camt053-v02.xml");
    expect(file.format).toBe("camt053");
    const [statement] = file.statements;
    expect(statement).toMatchObject({ accountIdentifier: "FR7630006000011234567890189", currency: "EUR", openingBalanceMinor: 100000, closingBalanceMinor: 218830, sequence: "42" });
    const [credit, batch, returned] = statement!.transactions;
    expect(credit).toMatchObject({ amountMinor: 120000, endToEndId: "FA-2026-0042", counterpartyName: "Dupont & Fils SARL", counterpartyIban: "FR7610107001011234567890129", bankReference: "BQ-0001" });
    expect(batch!.amountMinor).toBe(-101170);
    expect(batch!.references).toEqual(expect.arrayContaining(["SEPA-2026-0007", "FF-2026-0010", "FF-2026-0011"]));
    expect(returned).toMatchObject({ returnReason: "AC04", originalCurrency: "USD" });
    const sum = statement!.transactions.reduce((total, tx) => total + tx.amountMinor, 0);
    expect(statement!.openingBalanceMinor! + sum).toBe(statement!.closingBalanceMinor);
  });
  it("lit un camt.053.001.08 préfixé (statut structuré, partie imbriquée)", async () => {
    const [statement] = (await parse("camt053-v08.xml")).statements;
    expect(statement!.openingBalanceMinor).toBe(218830);
    expect(statement!.transactions[0]).toMatchObject({ amountMinor: -1200, bookingDate: "2026-04-01", counterpartyName: "Banque Exemple", label: expect.stringContaining("FRAIS") });
  });
  it("lit une notification camt.054", async () => {
    const file = await parse("camt054.xml");
    expect(file.format).toBe("camt054");
    expect(file.statements[0]!.transactions[0]!.endToEndId).toBe("FA-2026-0042");
  });
  it("refuse les entités externes (XXE) et les bombes XML", async () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt>&x;</BkToCstmrStmt></Document>`;
    const bomb = `<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">&b;</Document>`;
    for (const text of [xxe, bomb]) expect(Result.isFailure(await parseText(text))).toBe(true);
  });
});

describe("banking — MT940 / MT942", () => {
  it("lit les sous-champs allemands ?NN du :86:", async () => {
    const [statement] = (await parse("mt940-de.sta")).statements;
    expect(statement).toMatchObject({ openingBalanceMinor: 100000, closingBalanceMinor: 218800, accountIdentifier: "10020030/1234567890" });
    expect(statement!.transactions[0]).toMatchObject({ amountMinor: 120000, endToEndId: "FA-2026-0042", counterpartyName: "Muster GmbH", counterpartyIban: "DE89370400440532013000" });
    expect(statement!.transactions[1]!.amountMinor).toBe(-1200);
  });
  it("lit les clés /EREF/ françaises", async () => {
    const [statement] = (await parse("mt940-fr.sta")).statements;
    expect(statement!.transactions[0]).toMatchObject({ endToEndId: "FA-2026-0042", counterpartyName: "DUPONT ET FILS" });
  });
  it("marque les lignes MT942 comme provisoires", async () => {
    const file = await parse("mt942.sta");
    expect(file.format).toBe("mt942");
    expect(file.statements[0]!.transactions[0]).toMatchObject({ provisional: true, amountMinor: 25000 });
  });
  it("analyse un :86: en texte libre", () => {
    expect(parseInfo86("VIREMENT DUPONT").label).toContain("VIREMENT DUPONT");
  });
});

describe("banking — CFONB 120", () => {
  it("lit soldes, mouvements et compléments 05", async () => {
    const [statement] = (await parse("cfonb120.txt")).statements;
    expect(statement).toMatchObject({ accountIdentifier: "300060000112345678901", openingBalanceMinor: 100000, closingBalanceMinor: 218800 });
    expect(statement!.transactions[0]).toMatchObject({ amountMinor: 120000, counterpartyName: "DUPONT ET FILS SARL", references: expect.arrayContaining(["FA-2026-0042"]) });
    expect(statement!.transactions[1]!.amountMinor).toBe(-1200);
  });
});

describe("banking — OFX / QIF", () => {
  it("lit l'OFX 1 SGML et dérive le solde d'ouverture", async () => {
    const [statement] = (await parse("ofx1.ofx")).statements;
    expect(statement!.transactions.map((tx) => tx.amountMinor)).toEqual([120000, -1200]);
    expect(statement!.closingBalanceMinor).toBe(218800);
    expect(statement!.openingBalanceMinor).toBe(100000);
  });
  it("lit l'OFX 2 XML", async () => {
    const [statement] = (await parse("ofx2.ofx")).statements;
    expect(statement!.transactions[0]).toMatchObject({ amountMinor: -4590, bankReference: "X2" });
  });
  it("lit le QIF", async () => {
    const [statement] = (await parse("bank.qif")).statements;
    expect(statement!.transactions.map((tx) => tx.amountMinor)).toEqual([120000, -1200]);
    expect(statement!.transactions[0]!.bookingDate).toBe("2026-03-31");
  });
});

describe("banking — CSV", () => {
  it("lit le préréglage Crédit Agricole (Windows-1252, débit/crédit)", async () => {
    const [statement] = (await parse("credit-agricole.csv", { csvProfile: CSV_PRESETS.credit_agricole!.profile })).statements;
    expect(statement!.transactions.map((tx) => tx.amountMinor)).toEqual([120000, -1200]);
    expect(statement!.transactions[0]!.label).toContain("DUPONT ; FILS");
  });
  it("lit un CSV par nom de colonne avec guillemets doublés", async () => {
    const profile: CsvProfile = { ...DEFAULT_CSV_PROFILE, delimiter: ",", decimal: ".", dateFormat: "YYYY-MM-DD", columns: { bookingDate: "date", label: "label", amount: "amount", currency: "currency" } };
    const [statement] = (await parse("generic.csv", { csvProfile: profile })).statements;
    expect(statement!.transactions[0]!.label).toBe('Invoice "FA-2026-0042"');
  });
  it("valide les profils et prévisualise", async () => {
    expect(Result.isFailure(await Effect.runPromise(Effect.result(validateCsvProfile({ ...DEFAULT_CSV_PROFILE, amountMode: "debit_credit" }))))).toBe(true);
    expect(previewCsv("a;b\n1;2\n", DEFAULT_CSV_PROFILE)?.header).toEqual(["a", "b"]);
    expect(csvRows('a,"b\nc",d\n', ",", 10)).toEqual([["a", "b\nc", "d"]]);
  });
  it("exige un profil, refuse les colonnes inconnues", async () => {
    expect(Result.isFailure(await parseText("x;y\n"))).toBe(true);
    expect(Result.isFailure(await parseText("a;b\n1;2\n", { csvProfile: { ...DEFAULT_CSV_PROFILE, columns: { bookingDate: "zz", label: "a", amount: "b" } } }))).toBe(true);
  });
});

describe("banking — limites", () => {
  it("refuse les fichiers vides, trop gros, trop longs ou de format désactivé", async () => {
    expect(Result.isFailure(await parseText(""))).toBe(true);
    expect(Result.isFailure(await parseText("x".repeat(100), { maxBytes: 10 }))).toBe(true);
    const many = ["Date;Libellé;Montant", ...Array.from({ length: 20 }, () => "31/03/2026;X;1,00")].join("\n");
    expect(Result.isFailure(await parseText(many, { csvProfile: DEFAULT_CSV_PROFILE, maxLines: 5 }))).toBe(true);
    const forbidden = await Effect.runPromise(Effect.result(parseStatementFile({ bytes: fixture("bank.qif"), allowedFormats: ["camt053"], maxBytes: 1_000_000, options })));
    expect(Result.isFailure(forbidden)).toBe(true);
  });
});
