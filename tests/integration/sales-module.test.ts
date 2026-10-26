/** module sales — émission numérotée sans trou, avoirs plafonnés, encaissements, relances, conversion (base réelle). */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: unknown) => def };
});

import { Effect } from 'effect';
import { eq, and, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { organization, user, sales, salesPayments, salesReminders } from '@database/schemas';
import { salesService, type SalesDocumentInput } from '@/modules/sales/services/salesDocument.service';
import { salesModule } from '@/modules/sales/module';

const db = getDrizzle();
const t = `sales-${Date.now().toString(36)}`;
const author = `${t}-author`;
const orgId = `${t}-org`;
const owner = { userId: author, sessionId: null };
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const ISSUE_DAY = '2026-03-02';

const draft = (kind: SalesDocumentInput['kind'] = 'invoice'): SalesDocumentInput => ({
  kind, organizationId: orgId, title: `${t} ${kind}`, customerName: 'Client Test', customerEmail: 'client@test.local',
  customerCountry: 'FR', customerType: 'B2C', sellerCountry: 'FR', supplyType: 'services', currency: 'EUR', paymentTermDays: 30,
  lines: [
    { description: 'Prestation', quantity: '2', unitPriceMinor: 10000, taxCategory: 'standard' },
    { description: 'Remise test', quantity: '1', unitPriceMinor: 1000, discountPercent: '100', taxCategory: 'standard' },
  ],
});
const createAndIssue = async () => {
  const doc = await run(salesService.create(draft(), author, ISSUE_DAY));
  return run(salesService.transition(doc.id, 'ISSUED', owner, 'fr', ISSUE_DAY));
};

beforeAll(async () => {
  await db.insert(user).values({ id: author, name: 'Sales author', email: `${author}@test.local`, role: 'admin' });
  await db.insert(organization).values({ id: orgId, name: 'Sales org', slug: orgId, createdAt: new Date() });
});

afterAll(async () => {
  const docs = await db.select({ id: sales.id }).from(sales).where(eq(sales.organizationId, orgId));
  const ids = docs.map((d) => d.id);
  if (ids.length) {
    await db.delete(salesPayments).where(inArray(salesPayments.documentId, ids));
    for (const kind of ['credit_note', 'invoice', 'quote'] as const) await db.delete(sales).where(and(eq(sales.organizationId, orgId), eq(sales.kind, kind)));
  }
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(eq(user.id, author));
});

describe('module sales', () => {
  it('déclare un module sans localisation', () => {
    expect(salesModule.id).toBe('sales');
  });

  it('brouillon : totaux calculés (remise 100 %, TVA FR 20 %), sans numéro', async () => {
    const doc = await run(salesService.create(draft(), author, ISSUE_DAY));
    expect(doc).toMatchObject({ status: 'DRAFT', number: null, netMinor: 20000, taxMinor: 4000, grossMinor: 24000 });
  });

  it('émissions concurrentes : numéros consécutifs sans doublon ni trou', async () => {
    const drafts = await Promise.all(Array.from({ length: 6 }, () => run(salesService.create(draft(), author, ISSUE_DAY))));
    const issued = await Promise.all(drafts.map((d) => run(salesService.transition(d.id, 'ISSUED', owner, 'fr', ISSUE_DAY))));
    const numbers = issued.map((d) => d.number).sort();
    expect(numbers).toEqual(Array.from({ length: 6 }, (_, i) => `FA-2026-${String(i + 1).padStart(5, '0')}`));
    expect(issued[0]).toMatchObject({ status: 'ISSUED', issueDate: ISSUE_DAY, dueDate: '2026-04-01' });
  });

  it('document émis : modification et transitions dérivées refusées', async () => {
    const issued = await createAndIssue();
    await expect(run(salesService.update(issued.id, { title: 'x' }, owner, 'fr'))).rejects.toThrow();
    await expect(run(salesService.transition(issued.id, 'PAID', owner, 'fr'))).rejects.toThrow();
  });

  it('encaissements : partiel puis soldé, dépassement refusé', async () => {
    const invoice = await createAndIssue();
    const first = await run(salesService.recordPayment(invoice.id, { amountMinor: 10000, method: 'bank_transfer', paidAt: ISSUE_DAY }, author));
    expect(first.document).toMatchObject({ status: 'PARTIALLY_PAID', paidMinor: 10000 });
    await expect(run(salesService.recordPayment(invoice.id, { amountMinor: 20000, method: 'bank_transfer', paidAt: ISSUE_DAY }, author))).rejects.toThrow();
    const last = await run(salesService.recordPayment(invoice.id, { amountMinor: 14000, method: 'card', paidAt: ISSUE_DAY }, author));
    expect(last.document).toMatchObject({ status: 'PAID', paidMinor: 24000 });
  });

  it('avoir total : facture CREDITED, second avoir plafonné', async () => {
    const invoice = await createAndIssue();
    const credit = await run(salesService.createCreditNote(invoice.id, author, {}, ISSUE_DAY));
    const issuedCredit = await run(salesService.transition(credit.id, 'ISSUED', owner, 'fr', ISSUE_DAY));
    expect(issuedCredit.number).toMatch(/^AV-2026-\d{5}$/);
    const [after] = await db.select().from(sales).where(eq(sales.id, invoice.id));
    expect(after).toMatchObject({ status: 'CREDITED', creditedMinor: 24000 });
    const second = await run(salesService.createCreditNote(invoice.id, author, {}, ISSUE_DAY)).catch(() => null);
    if (second) await expect(run(salesService.transition(second.id, 'ISSUED', owner, 'fr', ISSUE_DAY))).rejects.toThrow();
  });

  it('relances : un niveau à la fois, idempotent le même jour', async () => {
    const invoice = await createAndIssue();
    expect(await run(salesService.recordReminder(invoice.id, author, '2026-04-01'))).toBeNull();
    expect(await run(salesService.recordReminder(invoice.id, author, '2026-04-09'))).toMatchObject({ level: 1, daysOverdue: 8 });
    expect(await run(salesService.recordReminder(invoice.id, author, '2026-04-09'))).toBeNull();
    expect(await run(salesService.recordReminder(invoice.id, author, '2026-05-05'))).toMatchObject({ level: 3 });
    const rows = await db.select().from(salesReminders).where(eq(salesReminders.documentId, invoice.id));
    expect(rows.map((r) => r.level).sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it('devis : numéro à l’envoi, acceptation, conversion en facture brouillon', async () => {
    const quote = await run(salesService.create(draft('quote'), author, ISSUE_DAY));
    const sent = await run(salesService.transition(quote.id, 'SENT', owner, 'fr', ISSUE_DAY));
    expect(sent.number).toMatch(/^DEV-2026-\d{4}$/);
    await run(salesService.transition(quote.id, 'ACCEPTED', owner, 'fr', ISSUE_DAY));
    const invoice = await run(salesService.convertQuote(quote.id, author, ISSUE_DAY));
    expect(invoice).toMatchObject({ kind: 'invoice', status: 'DRAFT', sourceDocumentId: quote.id, grossMinor: 24000 });
    const [converted] = await db.select().from(sales).where(eq(sales.id, quote.id));
    expect(converted.status).toBe('CONVERTED');
    await expect(run(salesService.convertQuote(quote.id, author, ISSUE_DAY))).rejects.toThrow();
  });
});
