/** sales × core/payments : lien de paiement signé, webhook → encaissement carte, statut recalculé, idempotence (base réelle, fournisseur mock). */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: unknown) => def };
});

import { Effect } from 'effect';
import { and, eq, inArray, like } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { organization, payments, sales, salesPayments, user } from '@database/schemas';
import { paymentEvents } from '@database/schemas/payments.schema';
import { appRuntime } from '@/lib/effect/runtime';
import { gatewayOf, handleWebhook, makeMockProvider, MOCK_SIGNATURE_HEADER, mockWebhookBody, PaymentGateway, signMockPayload } from '@/core/payments';
import { salesService, type SalesDocumentInput } from '@/modules/sales/services/salesDocument.service';
import { invoiceForPayLink, isPayableInvoice, payLinkToken, payLinkUrl, registerSalesPayments, startInvoiceCheckout } from '@/modules/sales/payments';

const SECRET = 'itest-mock-secret';
const LINK_SECRET = 'itest-link-secret';
const db = getDrizzle();
const t = `spay-${Date.now().toString(36)}`;
const orgId = `${t}-org`;
const author = `${t}-author`;
const owner = { userId: author, sessionId: null };
const ISSUE_DAY = '2026-03-02';
const provider = makeMockProvider(SECRET);
const run = <A, E>(e: Effect.Effect<A, E, any>) => appRuntime.runPromise(Effect.provideService(e, PaymentGateway, gatewayOf(provider)) as Effect.Effect<A, E, never>);
const urls = { successUrl: 'https://example.test/ok', cancelUrl: 'https://example.test/ko' };

let seq = 0;
const succeeded = (paymentId: string, amountMinor: number, eventId = `evt_${t}_${seq++}`) => {
  const body = mockWebhookBody({ eventId, type: 'mock.succeeded', kind: 'succeeded', paymentId, providerPaymentId: `mock_pi_${paymentId}`, sessionId: null, amount: { amountMinor, currency: 'EUR' } });
  return handleWebhook(body, new Headers({ [MOCK_SIGNATURE_HEADER]: signMockPayload(body, SECRET) }));
};

const draft: SalesDocumentInput = {
  kind: 'invoice', organizationId: orgId, title: `${t} invoice`, customerName: 'Client Test', customerEmail: 'client@test.local',
  customerCountry: 'FR', customerType: 'B2C', sellerCountry: 'FR', supplyType: 'services', currency: 'EUR', paymentTermDays: 30,
  lines: [{ description: 'Prestation', quantity: '1', unitPriceMinor: 10000, taxCategory: 'standard' }],
};
const issued = async () => {
  const doc = await run(salesService.create(draft, author, ISSUE_DAY));
  return run(salesService.transition(doc.id, 'ISSUED', owner, 'fr', ISSUE_DAY));
};
const reload = async (id: string) => (await db.select().from(sales).where(eq(sales.id, id)))[0]!;

beforeAll(async () => {
  await db.insert(user).values({ id: author, name: 'Sales author', email: `${author}@test.local`, role: 'admin' });
  await db.insert(organization).values({ id: orgId, name: 'Sales pay org', slug: orgId, createdAt: new Date() });
  registerSalesPayments();
});

afterAll(async () => {
  const pids = (await db.select({ id: payments.id }).from(payments).where(eq(payments.organizationId, orgId))).map((r) => r.id);
  if (pids.length) await db.delete(paymentEvents).where(inArray(paymentEvents.paymentId, pids));
  await db.delete(paymentEvents).where(like(paymentEvents.eventId, `evt_${t}_%`));
  await db.delete(payments).where(eq(payments.organizationId, orgId));
  const ids = (await db.select({ id: sales.id }).from(sales).where(eq(sales.organizationId, orgId))).map((d) => d.id);
  if (ids.length) {
    await db.delete(salesPayments).where(inArray(salesPayments.documentId, ids));
    await db.delete(sales).where(and(eq(sales.organizationId, orgId), inArray(sales.id, ids)));
  }
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(eq(user.id, author));
});

describe('sales : paiement en ligne d’une facture', () => {
  it('lien signé : seul le bon jeton ouvre la facture', async () => {
    const invoice = await issued();
    const token = payLinkToken(LINK_SECRET, invoice.id);
    expect((await run(invoiceForPayLink(LINK_SECRET, invoice.id, token)))?.id).toBe(invoice.id);
    expect(await run(invoiceForPayLink(LINK_SECRET, invoice.id, `${token.slice(0, 31)}x`))).toBeNull();
    expect(await run(invoiceForPayLink('other-secret', invoice.id, token))).toBeNull();
    expect(await run(invoiceForPayLink(LINK_SECRET, invoice.id, null))).toBeNull();
    // URL du back-office : jeton du secret de signature de l'application, vérifiable par la page publique.
    const url = new URL(await run(payLinkUrl('fr', invoice.id)));
    expect(url.pathname).toBe(`/fr/pay/invoice/${invoice.id}`);
    const appToken = url.searchParams.get('t');
    expect(appToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(appToken).not.toBe(token);
  });

  it('webhook payé → encaissement carte, facture PAID ; doublon ignoré', async () => {
    const invoice = await issued();
    const { payment } = await run(startInvoiceCheckout(invoice, urls));
    expect(payment).toMatchObject({ amount: 12000, currency: 'EUR', reference: `sales-invoice:${invoice.id}` });
    const eventId = `evt_${t}_dup`;
    await run(succeeded(payment.id, 12000, eventId));
    await run(succeeded(payment.id, 12000, eventId));
    await run(succeeded(payment.id, 12000)); // autre événement, même paiement : dédoublonné par référence
    const rows = await db.select().from(salesPayments).where(eq(salesPayments.documentId, invoice.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amountMinor: 12000, method: 'card', reference: `mock_pi_${payment.id}` });
    const after = await reload(invoice.id);
    expect(after).toMatchObject({ status: 'PAID', paidMinor: 12000 });
    expect(isPayableInvoice(after)).toBe(false);
  });

  it('paiement partiel préalable : le lien demande le restant dû, statut PARTIALLY_PAID → PAID', async () => {
    const invoice = await issued();
    await run(salesService.recordPayment(invoice.id, { amountMinor: 2000, method: 'bank_transfer', paidAt: ISSUE_DAY }, author));
    const partial = await reload(invoice.id);
    expect(partial.status).toBe('PARTIALLY_PAID');
    const { payment } = await run(startInvoiceCheckout(partial, urls));
    expect(payment.amount).toBe(10000);
    await run(succeeded(payment.id, 10000));
    expect(await reload(invoice.id)).toMatchObject({ status: 'PAID', paidMinor: 12000 });
  });
});
