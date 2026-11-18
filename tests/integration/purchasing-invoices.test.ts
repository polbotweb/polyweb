/** Factures fournisseur, rapprochement, règlement, réglages et export SEPA (base réelle). */
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
import { purchasingSettingsService } from "@/modules/purchasing/services/settings.service";
import { purchasingInvoicesService } from "@/modules/purchasing/services/invoices.service";
import { purchasingOpsService } from "@/modules/purchasing/services/ops.service";
import { purchasingService } from "@/modules/purchasing/services/purchasing.service";
import { DEFAULT_PURCHASING_SETTINGS } from "@/modules/purchasing/domain/settings";
import { DEFAULT_APPROVAL_POLICY } from "@/core/approvals";
import { purchasingInvoices, purchasingPayments, purchasingSepaExports } from "@/modules/purchasing/schema/extended";
import { purchasingSuppliers } from "@/modules/purchasing/schema";

const db = getDrizzle();
const t = `pinv-${Date.now().toString(36)}`;
const author = `${t}-author`;
const orgId = `${t}-org`;
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

beforeAll(async () => {
  await db.insert(user).values({ id: author, name: "Invoice author", email: `${author}@test.local`, role: "admin" });
  await db.insert(organization).values({ id: orgId, name: "Invoice org", slug: orgId, createdAt: new Date() });
});

afterAll(async () => {
  await db.delete(purchasingPayments).where(eq(purchasingPayments.organizationId, orgId));
  await db.delete(purchasingSepaExports).where(eq(purchasingSepaExports.organizationId, orgId));
  const invoices = await db.select({ id: purchasingInvoices.id }).from(purchasingInvoices).where(eq(purchasingInvoices.organizationId, orgId));
  if (invoices.length) await db.delete(purchasingInvoices).where(inArray(purchasingInvoices.id, invoices.map((row) => row.id)));
  await db.delete(purchasingSuppliers).where(eq(purchasingSuppliers.organizationId, orgId));
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(eq(user.id, author));
});

describe("purchasing invoices", () => {
  let invoiceId = "";

  it("enregistre les réglages du tenant (matching 2 voies, débiteur SEPA)", async () => {
    const saved = await run(purchasingSettingsService.save(orgId, {
      ...DEFAULT_PURCHASING_SETTINGS,
      matchingMode: "two_way",
      matchingPolicy: "allow_with_acceptance",
      debtorName: "Polyweb SAS",
      debtorIban: "FR1420041010050500013M02606",
      debtorBic: "PSSTFRPPXXX",
    }, DEFAULT_APPROVAL_POLICY, author));
    expect(saved.settings.matchingMode).toBe("two_way");
    expect(saved.settings.debtorIban).toBe("FR1420041010050500013M02606");
  });

  it("crée, émet et règle une facture fournisseur", async () => {
    const supplier = await run(purchasingService.createSupplier({
      organizationId: orgId, code: "SEPA1", name: "Fournisseur SEPA", email: "s@test.local", country: "FR",
    }));
    await db.update(purchasingSuppliers).set({ iban: "DE89370400440532013000", bic: "COBADEFFXXX" }).where(eq(purchasingSuppliers.id, supplier.id));
    const invoice = await run(purchasingInvoicesService.create({
      organizationId: orgId, supplierId: supplier.id, currency: "EUR", supplierInvoiceNumber: "F-100",
      lines: [{ description: "Prestation", quantity: 2, unitPrice: "50.00", ratePercent: "20" }],
    }, author));
    expect(invoice.status).toBe("DRAFT");
    expect(invoice.netMinor).toBe(10000);
    expect(invoice.taxMinor).toBe(2000);
    expect(invoice.grossMinor).toBe(12000);
    invoiceId = invoice.id;
    const issued = await run(purchasingInvoicesService.issue(invoiceId, author, { today: "2026-11-18" }));
    expect(issued.status).toBe("ISSUED");
    expect(issued.number).toMatch(/^FF-2026-\d{5}$/);
    const paid = await run(purchasingInvoicesService.recordPayment(invoiceId, { amountMinor: 5000, method: "bank_transfer", paidAt: "2026-11-18", reference: "VIR-1" }, author));
    expect(paid.invoice.status).toBe("PARTIALLY_PAID");
    expect(paid.invoice.paidMinor).toBe(5000);
  });

  it("exporte un lot SEPA pain.001 pour le solde dû", async () => {
    const result = await run(purchasingOpsService.exportSepa({
      organizationId: orgId, invoiceIds: [invoiceId], requestedExecutionDate: "2026-11-20",
    }, author));
    expect(result.export.paymentCount).toBe(1);
    expect(result.export.totalMinor).toBe(7000);
    expect(result.xml).toContain("pain.001.001.03");
    expect(result.xml).toContain("DE89370400440532013000");
    expect(result.xml).toContain("FR1420041010050500013M02606");
  });

  it("refuse un trop-perçu", async () => {
    const exit = await Effect.runPromiseExit(purchasingInvoicesService.recordPayment(invoiceId, { amountMinor: 8000, method: "cash", paidAt: "2026-11-18" }, author));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
