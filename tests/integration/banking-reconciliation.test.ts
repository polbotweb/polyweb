/**
 * Banque (base réelle) : import idempotent, cloisonnement par organisation, rapprochement d'une
 * facture fournisseur (paiement réel + lettrage) puis annulation, écart soumis à approbation,
 * période verrouillée, règle (simulation + application), flux GoCardless et versements Stripe
 * avec fournisseurs injectés (aucun appel réseau).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("astro:actions", () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: unknown) => def };
});

import { Effect, Exit } from "effect";
import { eq, inArray } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { organization, user } from "@database/schemas";
import { DEFAULT_APPROVAL_POLICY } from "@/core/approvals";
import { registerPurchasingReconciliation } from "@/modules/purchasing/reconciliation";
import { registerSalesReconciliation } from "@/modules/sales/reconciliation";
import { registerBankingReconciliation } from "@/modules/banking/reconciliation";
import { purchasingInvoicesService } from "@/modules/purchasing/services/invoices.service";
import { purchasingService } from "@/modules/purchasing/services/purchasing.service";
import { purchasingInvoices, purchasingPayments } from "@/modules/purchasing/schema/extended";
import { purchasingSuppliers } from "@/modules/purchasing/schema";
import { DEFAULT_BANKING_SETTINGS } from "@/modules/banking/domain/settings";
import {
  bankAccounts, bankFeedConnections, bankImports, bankLedgerEntries, bankLedgerLines, bankPayouts, bankReconciliationAllocations, bankReconciliationLines,
  bankReconciliations, bankRules, bankSettings, bankStatements, bankTransactions,
} from "@/modules/banking/schema";
import { bankAccountsService } from "@/modules/banking/services/accounts.service";
import { bankFeedsService, setBankFeedProviderForTests } from "@/modules/banking/services/feeds.service";
import { importStatement } from "@/modules/banking/services/import.service";
import { matchTransactions } from "@/modules/banking/services/matching.service";
import { bankPayoutsService, type PayoutApi } from "@/modules/banking/services/payouts.service";
import { bankingQueries } from "@/modules/banking/services/queries.service";
import { decideWriteOff, reconcile, reverseReconciliation, setIgnored } from "@/modules/banking/services/reconcile.service";
import { bankRulesService } from "@/modules/banking/services/rules.service";
import { bankingSettingsService } from "@/modules/banking/services/settings.service";
import type { BankFeedProvider } from "@/modules/banking/domain/feeds";

const db = getDrizzle();
const t = `bank-${Date.now().toString(36)}`;
const author = `${t}-author`;
const approver = `${t}-approver`;
const orgId = `${t}-org`;
const otherOrg = `${t}-other`;
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const exit = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromiseExit(effect);
const today = new Date().toISOString().slice(0, 10);
const compact = today.replaceAll("-", "");

const ofx = (lines: readonly { id: string; amount: string; name: string }[], balance: string) => new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><TRNUID>1</TRNUID><STMTRS><CURDEF>EUR</CURDEF>
<BANKACCTFROM><BANKID>30006</BANKID><ACCTID>${t}</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>
<BANKTRANLIST><DTSTART>${compact}000000</DTSTART><DTEND>${compact}235959</DTEND>
${lines.map((line) => `<STMTTRN><TRNTYPE>OTHER</TRNTYPE><DTPOSTED>${compact}120000</DTPOSTED><TRNAMT>${line.amount}</TRNAMT><FITID>${t}-${line.id}</FITID><NAME>${line.name}</NAME></STMTTRN>`).join("\n")}
</BANKTRANLIST><LEDGERBAL><BALAMT>${balance}</BALAMT><DTASOF>${compact}</DTASOF></LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
`);

const accountInput = (label: string) => ({
  label, iban: null, bic: null, accountNumber: null, bankName: null, currency: "EUR", ledgerAccount: "512100", journalCode: "BQ1", journalLabel: "Banque test",
  openingBalanceMinor: null, openingBalanceDate: null, defaultFormat: null, csvProfileId: null, automationMode: null,
});

let accountId = "";
const lineId = async (fitid: string) => (await db.select({ id: bankTransactions.id }).from(bankTransactions).where(eq(bankTransactions.bankReference, `${t}-${fitid}`)))[0]?.id ?? "";

beforeAll(async () => {
  registerSalesReconciliation();
  registerPurchasingReconciliation();
  registerBankingReconciliation();
  await db.insert(user).values([
    { id: author, name: "Bank author", email: `${author}@test.local`, role: "admin" },
    { id: approver, name: "Bank approver", email: `${approver}@test.local`, role: "admin" },
  ]);
  await db.insert(organization).values([
    { id: orgId, name: "Bank org", slug: orgId, createdAt: new Date() },
    { id: otherOrg, name: "Other org", slug: otherOrg, createdAt: new Date() },
  ]);
});

afterAll(async () => {
  setBankFeedProviderForTests(null);
  for (const org of [orgId, otherOrg]) {
    const entries = await db.select({ id: bankLedgerEntries.id }).from(bankLedgerEntries).where(eq(bankLedgerEntries.organizationId, org));
    if (entries.length) {
      await db.delete(bankLedgerLines).where(inArray(bankLedgerLines.entryId, entries.map((row) => row.id)));
      await db.delete(bankLedgerEntries).where(inArray(bankLedgerEntries.id, entries.map((row) => row.id)));
    }
    const recons = await db.select({ id: bankReconciliations.id }).from(bankReconciliations).where(eq(bankReconciliations.organizationId, org));
    if (recons.length) {
      const ids = recons.map((row) => row.id);
      await db.update(purchasingPayments).set({ reconciliationId: null }).where(inArray(purchasingPayments.reconciliationId, ids));
      await db.delete(bankReconciliationLines).where(inArray(bankReconciliationLines.reconciliationId, ids));
      await db.delete(bankReconciliationAllocations).where(inArray(bankReconciliationAllocations.reconciliationId, ids));
      await db.update(bankPayouts).set({ reconciliationId: null }).where(inArray(bankPayouts.reconciliationId, ids));
      await db.delete(bankReconciliations).where(inArray(bankReconciliations.id, ids));
    }
    await db.delete(purchasingPayments).where(eq(purchasingPayments.organizationId, org));
    await db.delete(purchasingInvoices).where(eq(purchasingInvoices.organizationId, org));
    await db.delete(purchasingSuppliers).where(eq(purchasingSuppliers.organizationId, org));
    await db.delete(bankTransactions).where(eq(bankTransactions.organizationId, org));
    await db.delete(bankStatements).where(eq(bankStatements.organizationId, org));
    await db.delete(bankImports).where(eq(bankImports.organizationId, org));
    await db.delete(bankFeedConnections).where(eq(bankFeedConnections.organizationId, org));
    await db.delete(bankPayouts).where(eq(bankPayouts.organizationId, org));
    await db.delete(bankRules).where(eq(bankRules.organizationId, org));
    await db.delete(bankSettings).where(eq(bankSettings.organizationId, org));
    await db.delete(bankAccounts).where(eq(bankAccounts.organizationId, org));
  }
  await db.delete(organization).where(inArray(organization.id, [orgId, otherOrg]));
  await db.delete(user).where(inArray(user.id, [author, approver]));
});

describe("banking — import et cloisonnement", () => {
  it("crée un compte et importe un relevé OFX ; le même fichier est ignoré", async () => {
    accountId = (await run(bankAccountsService.save(orgId, null, accountInput("Compte principal"), author))).id;
    const bytes = ofx([
      { id: "1", amount: "-120.00", name: "VIREMENT FOURNISSEUR" },
      { id: "2", amount: "-12.50", name: "FRAIS TENUE DE COMPTE" },
      { id: "3", amount: "-99.00", name: "PRELEVEMENT DIVERS" },
      { id: "4", amount: "-50.00", name: "PAIEMENT PARTIEL" },
    ], "1000.00");
    const first = await run(importStatement(orgId, { bankAccountId: accountId, bytes, fileName: "releve.ofx" }, author));
    expect(first).toMatchObject({ duplicate: false, inserted: 4, duplicates: 0 });
    const again = await run(importStatement(orgId, { bankAccountId: accountId, bytes, fileName: "releve.ofx" }, author));
    expect(again.duplicate).toBe(true);
    expect(again.inserted).toBe(0);
    const rows = await db.select().from(bankTransactions).where(eq(bankTransactions.organizationId, orgId));
    expect(rows).toHaveLength(4);
  });

  it("une autre organisation ne voit ni le compte ni les lignes", async () => {
    const id = await lineId("1");
    expect(Exit.isFailure(await exit(bankingQueries.transaction(otherOrg, id)))).toBe(true);
    expect(Exit.isFailure(await exit(importStatement(otherOrg, { bankAccountId: accountId, bytes: ofx([{ id: "x", amount: "1.00", name: "X" }], "1.00"), fileName: "x.ofx" }, author)))).toBe(true);
    const listed = await run(bankingQueries.transactions(otherOrg, {}));
    expect(listed.total).toBe(0);
  });
});

describe("banking — rapprochement", () => {
  let invoiceId = "";
  let reconciliationId = "";

  beforeAll(async () => {
    const supplier = await run(purchasingService.createSupplier({ organizationId: orgId, code: "BANK1", name: "Fournisseur banque", email: "f@test.local", country: "FR" }));
    const invoice = await run(purchasingInvoicesService.create({
      organizationId: orgId, supplierId: supplier.id, currency: "EUR", supplierInvoiceNumber: `F-${t}`,
      lines: [{ description: "Prestation", quantity: 1, unitPrice: "100.00", ratePercent: "20" }],
    }, author));
    invoiceId = (await run(purchasingInvoicesService.issue(invoice.id, author, { today }))).id;
  });

  it("rapproche la ligne avec la facture : paiement réel, facture payée, lettrage", async () => {
    const id = await lineId("1");
    const result = await run(reconcile(orgId, { transactionIds: [id], allocations: [{ source: "purchasing-invoice", targetId: invoiceId, amountMinor: 12000 }], adjustments: [], note: null }, { mode: "manual", actorId: author }));
    expect(result.status).toBe("applied");
    reconciliationId = result.id;
    const [invoice] = await db.select().from(purchasingInvoices).where(eq(purchasingInvoices.id, invoiceId));
    expect(invoice!.status).toBe("PAID");
    const payments = await db.select().from(purchasingPayments).where(eq(purchasingPayments.invoiceId, invoiceId));
    expect(payments).toHaveLength(1);
    expect(payments[0]!.amountMinor).toBe(12000);
    const [line] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, id));
    expect(line!.status).toBe("reconciled");
    expect(result.lettering).toMatch(/^[A-Z]+$/);
  });

  it("annule le rapprochement : contre-passation, facture rouverte, ligne à nouveau ouverte", async () => {
    await run(reverseReconciliation(orgId, reconciliationId, "Erreur d'affectation", author));
    const [invoice] = await db.select().from(purchasingInvoices).where(eq(purchasingInvoices.id, invoiceId));
    expect(invoice!.status).toBe("ISSUED");
    const [line] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, await lineId("1")));
    expect(["unmatched", "suggested"]).toContain(line!.status);
    const [recon] = await db.select().from(bankReconciliations).where(eq(bankReconciliations.id, reconciliationId));
    expect(recon!.status).toBe("reversed");
    expect(Exit.isFailure(await exit(reverseReconciliation(orgId, reconciliationId, "Encore", author)))).toBe(true);
  });

  it("un écart au-delà du seuil part en approbation ; l'auteur ne peut pas s'auto-approuver (hors admin plateforme)", async () => {
    await run(bankingSettingsService.save(orgId, DEFAULT_BANKING_SETTINGS, { ...DEFAULT_APPROVAL_POLICY, mode: "single_threshold", thresholdMinor: 50, currency: "EUR", bands: [] }, author));
    const id = await lineId("4");
    const pending = await run(reconcile(orgId, {
      transactionIds: [id], allocations: [{ source: "purchasing-invoice", targetId: invoiceId, amountMinor: 12000 }], adjustments: [{ kind: "write_off", bankEffectMinor: 7000 }], note: "Escompte négocié",
    }, { mode: "manual", actorId: author }));
    expect(pending.status).toBe("pending_approval");
    const [line] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, id));
    expect(line!.status).toBe("pending_approval");
    const self = await exit(decideWriteOff(orgId, pending.id, { userId: author, isPlatformAdmin: false, organizationRole: "orgOwner", permissions: ["banking:approve"] }, "APPROVED", null));
    expect(Exit.isFailure(self)).toBe(true);
    const decided = await run(decideWriteOff(orgId, pending.id, { userId: approver, isPlatformAdmin: true, organizationRole: null, permissions: ["banking:approve"] }, "APPROVED", "OK"));
    expect(decided.status).toBe("applied");
    const [invoice] = await db.select().from(purchasingInvoices).where(eq(purchasingInvoices.id, invoiceId));
    expect(invoice!.status).toBe("PAID");
    const writeOffs = await db.select().from(bankLedgerEntries).where(eq(bankLedgerEntries.reconciliationId, decided.id));
    expect(writeOffs.map((entry) => entry.kind)).toContain("write_off");
  });

  it("période verrouillée (refus) : aucun rapprochement possible", async () => {
    await run(bankingSettingsService.save(orgId, { ...DEFAULT_BANKING_SETTINGS, lockDate: "2099-12-31", lockedPeriodPolicy: "refuse" }, null, author));
    const id = await lineId("3");
    const locked = await exit(reconcile(orgId, { transactionIds: [id], allocations: [], adjustments: [{ kind: "fee", bankEffectMinor: -9900 }], note: null }, { mode: "manual", actorId: author }));
    expect(Exit.isFailure(locked)).toBe(true);
    await run(bankingSettingsService.save(orgId, DEFAULT_BANKING_SETTINGS, null, author));
  });

  it("ignore puis réintègre une ligne", async () => {
    const id = await lineId("3");
    expect(await run(setIgnored(orgId, [id], true, "Doublon banque", author))).toBe(1);
    expect((await db.select().from(bankTransactions).where(eq(bankTransactions.id, id)))[0]!.status).toBe("ignored");
    expect(await run(setIgnored(orgId, [id], false, null, author))).toBe(1);
    expect((await db.select().from(bankTransactions).where(eq(bankTransactions.id, id)))[0]!.status).toBe("unmatched");
  });
});

describe("banking — règles", () => {
  it("simule puis applique une règle de frais bancaires (écriture au grand livre)", async () => {
    const rule = {
      name: "Frais de tenue", position: 10, active: true,
      conditions: { bankAccountId: null, direction: "out" as const, amountMinMinor: null, amountMaxMinor: null, label: { operator: "contains" as const, value: "FRAIS TENUE" }, counterpartyIban: null, counterpartyName: null, bankCode: null },
      actions: { kind: "fee" as const, accountCode: null, vatRate: null, label: null, auxAccount: null, auxLabel: null, targetBankAccountId: null, autoValidate: true },
    };
    const dry = await run(bankRulesService.dryRun(orgId, rule));
    expect(dry.matched).toBe(1);
    await run(bankRulesService.save(orgId, rule, author));
    await run(bankingSettingsService.save(orgId, { ...DEFAULT_BANKING_SETTINGS, automationMode: "auto_exact" }, null, author));
    const id = await lineId("2");
    await run(matchTransactions(orgId, [id], { allowAuto: true, actorId: author }));
    const [line] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, id));
    expect(line!.status).toBe("reconciled");
    const entries = await db.select().from(bankLedgerEntries).where(eq(bankLedgerEntries.transactionId, id));
    expect(entries.length).toBeGreaterThan(0);
    const lines = await db.select().from(bankLedgerLines).where(inArray(bankLedgerLines.entryId, entries.map((entry) => entry.id)));
    expect(lines.reduce((sum, row) => sum + row.debitMinor, 0)).toBe(lines.reduce((sum, row) => sum + row.creditMinor, 0));
    expect(lines.some((row) => row.account === "512100")).toBe(true);
  });
});

describe("banking — flux et versements (fournisseurs injectés)", () => {
  it("flux GoCardless : refusé tant que désactivé ; identifiants scellés, liaison et synchronisation via l'import commun", async () => {
    expect(Exit.isFailure(await exit(bankFeedsService.saveCredentials(orgId, { bankAccountId: accountId, secretId: "secret-id-123", secretKey: "secret-key-1234567890" }, author)))).toBe(true);
    await run(bankingSettingsService.save(orgId, { ...DEFAULT_BANKING_SETTINGS, feedsEnabled: true }, null, author));
    const fake: BankFeedProvider = {
      key: "gocardless",
      institutions: () => Effect.succeed([{ id: "BANK_FR", name: "Banque test", bic: null, maxHistoryDays: 90 }]),
      createLink: () => Effect.succeed({ requisitionId: "req-1", link: "https://example.test/link", agreementExpiresAt: null }),
      linkedAccounts: () => Effect.succeed({ status: "linked" as const, accounts: [{ id: "ext-1", iban: null, currency: "EUR", name: "Courant" }] }),
      transactions: () => Effect.succeed({
        booked: [{ transactionId: `${t}-feed-1`, bookingDate: today, transactionAmount: { amount: "250.00", currency: "EUR" }, remittanceInformationUnstructured: "VIREMENT CLIENT", debtorName: "Client SA" }],
        pending: [],
      }),
    };
    setBankFeedProviderForTests(fake);
    const connection = await run(bankFeedsService.saveCredentials(orgId, { bankAccountId: accountId, secretId: "secret-id-123", secretKey: "secret-key-1234567890" }, author));
    expect(connection).not.toHaveProperty("sealedCredentials");
    expect(connection.hasCredentials).toBe(true);
    const [stored] = await db.select().from(bankFeedConnections).where(eq(bankFeedConnections.id, connection.id));
    expect(stored!.sealedCredentials).not.toContain("secret-key-1234567890");
    expect(await run(bankFeedsService.institutions(orgId, connection.id, "FR"))).toHaveLength(1);
    expect((await run(bankFeedsService.startLink(orgId, connection.id, { institutionId: "BANK_FR", redirectUrl: "https://app.test/fr/admin/banking/accounts", language: "fr" }, author))).link).toBe("https://example.test/link");
    expect((await run(bankFeedsService.refresh(orgId, connection.id, author))).status).toBe("linked");
    const synced = await run(bankFeedsService.sync(orgId, connection.id, author));
    expect(synced).toMatchObject({ booked: 1, inserted: 1 });
    const again = await run(bankFeedsService.sync(orgId, connection.id, author));
    expect(again.inserted).toBe(0);
    expect((await run(bankFeedsService.list(otherOrg)))).toHaveLength(0);
  });

  it("versements Stripe : désactivés par défaut ; synchronisation idempotente avec décomposition", async () => {
    await run(bankingSettingsService.save(orgId, DEFAULT_BANKING_SETTINGS, null, author));
    const api: PayoutApi = {
      payouts: async () => [{ id: `po_${t}`, status: "paid", arrivalDate: today, currency: "EUR", amountMinor: 9500 }],
      items: async () => [
        { externalId: `txn_${t}_1`, type: "charge", amountMinor: 10000, feeMinor: 500, netMinor: 9500, sourceId: null },
      ],
    };
    expect(Exit.isFailure(await exit(bankPayoutsService.sync(orgId, author, { api })))).toBe(true);
    await run(bankingSettingsService.save(orgId, { ...DEFAULT_BANKING_SETTINGS, stripePayoutsEnabled: true }, null, author));
    expect(await run(bankPayoutsService.sync(orgId, author, { api }))).toEqual({ fetched: 1, created: 1, updated: 0 });
    expect(await run(bankPayoutsService.sync(orgId, author, { api }))).toEqual({ fetched: 1, created: 0, updated: 1 });
    const [payout] = await run(bankPayoutsService.list(orgId));
    expect(payout).toMatchObject({ grossMinor: 10000, feeMinor: 500, amountMinor: 9500 });
  });
});
