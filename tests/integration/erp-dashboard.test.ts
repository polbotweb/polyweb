/**
 * Tableau de bord ERP — agrégats SQL sur base réelle : CA factures − avoirs + boutique sans double
 * comptage, encaissements, achats reçus, marges, encours, stock valorisé et alertes, isolation tenant/devise.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: unknown) => def };
});

import { Effect } from 'effect';
import { eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import {
  organization, user, products, productVariants, orders, orderLines, sales as salesDocuments, salesPayments,
  logisticsItems, logisticsStockReservations, purchasingOrderLines, purchasingReceipts,
} from '@database/schemas';
import { logisticsService } from '@/modules/logistics/services/logistics.service';
import { purchasingService } from '@/modules/purchasing/services/purchasing.service';
import { dashboardService } from '@/modules/dashboard/services/dashboard.service';
import type { DashboardFilters } from '@/modules/dashboard/domain/period';

const db = getDrizzle();
const t = `dash-${Date.now().toString(36)}`;
const author = `${t}-author`;
const orgId = `${t}-org`;
const otherOrg = `${t}-other`;
const owner = { userId: author, sessionId: null };
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const filters: DashboardFilters = { from: '2026-01-01', to: '2026-03-31', granularity: 'month', currency: 'EUR', lowStockThreshold: 5 };
const future = new Date(Date.now() + 3_600_000);
const past = new Date(Date.now() - 3_600_000);

let seq = 0;
const invoice = async (organizationId: string, v: Partial<typeof salesDocuments.$inferInsert>) => {
  const [row] = await db.insert(salesDocuments).values({
    organizationId, kind: 'invoice', slug: `${t}-doc-${seq++}`, title: 'Doc', customerName: 'Client', customerCountry: 'FR', sellerCountry: 'FR', ...v,
  }).returning();
  return row!.id;
};

const order = async (status: typeof orders.$inferInsert['status'], v: Partial<typeof orders.$inferInsert>, lines: { variantId: string | null; sku: string; quantity: number; total: number }[] = []) => {
  const [row] = await db.insert(orders).values({
    organizationId: orgId, number: `${t}-CMD-${seq++}`, status, locale: 'fr', email: 'c@test.local', customerName: 'Client', addressLine1: '1 rue',
    postcode: '75001', city: 'Paris', country: 'FR', shippingMethod: 'standard', shippingMinor: 0, currency: 'EUR', netMinor: 0, taxMinor: 0, grossMinor: 0,
    taxTreatment: 'domestic', taxBreakdown: [], expiresAt: future, ...v,
  }).returning();
  if (lines.length) {
    await db.insert(orderLines).values(lines.map((l, i) => ({
      orderId: row!.id, position: i + 1, variantId: l.variantId, sku: l.sku, description: l.sku, quantity: l.quantity,
      unitPriceMinor: Math.round(l.total / l.quantity), lineTotalMinor: l.total, taxCategory: 'standard' as const,
    })));
  }
  return row!.id;
};

const purchase = async (supplierId: string, warehouseId: string, sku: string, quantity: number, unitPrice: string) => {
  const po = await run(purchasingService.createOrder({ organizationId: orgId, supplierId, warehouseId, currency: 'EUR', lines: [{ sku, quantity, unitPrice }] }, author));
  await run(purchasingService.transition(po.id, 'SENT', owner, { today: '2026-03-01' }));
  const [line] = await db.select().from(purchasingOrderLines).where(eq(purchasingOrderLines.orderId, po.id));
  await run(purchasingService.receive(po.id, { lines: [{ lineId: line!.id, quantity }] }, owner, { today: '2026-03-10' }));
  await db.update(purchasingReceipts).set({ receivedAt: new Date('2026-03-10T09:00:00Z') }).where(eq(purchasingReceipts.orderId, po.id));
};

beforeAll(async () => {
  await db.insert(user).values({ id: author, name: 'Dashboard author', email: `${author}@test.local`, role: 'admin' });
  await db.insert(organization).values([
    { id: orgId, name: 'Dashboard org', slug: orgId, createdAt: new Date() },
    { id: otherOrg, name: 'Dashboard other', slug: otherOrg, createdAt: new Date() },
  ]);
  const [p] = await db.insert(products).values({ organizationId: orgId, slug: `${t}-p`, title: 'Produit', status: 'PUBLISHED' }).returning();
  const [tee, ebook] = await db.insert(productVariants).values([
    { productId: p!.id, sku: `${t}-TEE`, position: 1, priceMinor: 1200, currency: 'EUR' },
    { productId: p!.id, sku: `${t}-EBOOK`, position: 2, priceMinor: 1200, currency: 'EUR' },
  ]).returning();

  const warehouseId = (await run(logisticsService.createWarehouse({ organizationId: orgId, code: 'MAIN', name: 'Principal' }))).id;
  await run(logisticsService.createItem({ organizationId: orgId, sku: 'TEE', name: 'T-shirt', variantId: tee!.id }));
  await run(logisticsService.createItem({ organizationId: orgId, sku: 'BOLT', name: 'Boulon' }));
  await run(logisticsService.createItem({ organizationId: orgId, sku: 'EMPTY', name: 'Vide' }));
  const supplier = (await run(purchasingService.createSupplier({ organizationId: orgId, code: 'ACME', name: 'Acme' }))).id;
  await purchase(supplier, warehouseId, 'TEE', 4, '4.00');
  await purchase(supplier, warehouseId, 'TEE', 6, '5.00');
  await purchase(supplier, warehouseId, 'BOLT', 3, '1.00');
  const [teeItem] = await db.select().from(logisticsItems).where(eq(logisticsItems.variantId, tee!.id));
  await db.insert(logisticsStockReservations).values([
    { organizationId: orgId, warehouseId, itemId: teeItem!.id, quantity: 3, reference: `${t}-r1`, expiresAt: future },
    { organizationId: orgId, warehouseId, itemId: teeItem!.id, quantity: 50, reference: `${t}-r2`, expiresAt: past },
  ]);

  const a = await invoice(orgId, { status: 'PAID', issueDate: '2026-01-15', dueDate: '2026-02-15', netMinor: 10_000, taxMinor: 2_000, grossMinor: 12_000, paidMinor: 12_000 });
  const b = await invoice(orgId, { status: 'PARTIALLY_PAID', issueDate: '2026-02-10', dueDate: '2026-02-20', netMinor: 5_000, taxMinor: 1_000, grossMinor: 6_000, paidMinor: 2_000, creditedMinor: 1_200 });
  await invoice(orgId, { kind: 'credit_note', status: 'ISSUED', sourceDocumentId: b, issueDate: '2026-02-15', netMinor: 1_000, taxMinor: 200, grossMinor: 1_200 });
  const c = await invoice(orgId, { status: 'ISSUED', issueDate: '2026-03-01', dueDate: '2099-01-01', netMinor: 1_000, taxMinor: 200, grossMinor: 1_200 });
  await invoice(orgId, { status: 'DRAFT', issueDate: '2026-03-02', netMinor: 99_000, grossMinor: 99_000 });
  await invoice(orgId, { status: 'CANCELLED', issueDate: '2026-03-02', netMinor: 88_000, grossMinor: 88_000 });
  await invoice(orgId, { status: 'ISSUED', currency: 'USD', issueDate: '2026-03-02', dueDate: '2026-03-05', netMinor: 77_000, grossMinor: 77_000 });
  const foreign = await invoice(otherOrg, { status: 'ISSUED', issueDate: '2026-01-05', dueDate: '2026-01-10', netMinor: 50_000, grossMinor: 60_000 });
  await db.insert(salesPayments).values([
    { organizationId: orgId, documentId: a, amountMinor: 12_000, currency: 'EUR', paidAt: '2026-01-20' },
    { organizationId: orgId, documentId: b, amountMinor: 2_000, currency: 'EUR', paidAt: '2026-03-05' },
    { organizationId: otherOrg, documentId: foreign, amountMinor: 1_000, currency: 'EUR', paidAt: '2026-01-20' },
  ]);

  await order('PAID', { paidAt: new Date('2026-02-05T10:00:00Z'), shippingMinor: 600, netMinor: 2_500, taxMinor: 500, grossMinor: 3_000 },
    [{ variantId: tee!.id, sku: 'TEE', quantity: 2, total: 2_400 }, { variantId: null, sku: 'SHIPPING', quantity: 1, total: 600 }]);
  await order('DELIVERED', { paidAt: new Date('2026-03-02T10:00:00Z'), salesDocumentId: c, netMinor: 1_000, taxMinor: 200, grossMinor: 1_200 },
    [{ variantId: tee!.id, sku: 'TEE', quantity: 1, total: 1_200 }]);
  await order('SHIPPED', { paidAt: new Date('2026-03-31T23:30:00Z'), netMinor: 1_000, taxMinor: 200, grossMinor: 1_200 },
    [{ variantId: ebook!.id, sku: 'EBOOK', quantity: 1, total: 1_200 }]);
  await order('PAID', { paidAt: new Date('2026-04-01T00:00:00Z'), netMinor: 70_000, grossMinor: 70_000 });
  await order('CANCELLED', { paidAt: new Date('2026-02-01T10:00:00Z'), netMinor: 60_000, grossMinor: 60_000 });
  await order('PENDING_PAYMENT', {});
  await order('PENDING_PAYMENT', { expiresAt: past });
});

afterAll(async () => {
  const oids = (await db.select({ id: orders.id }).from(orders).where(inArray(orders.organizationId, [orgId, otherOrg]))).map((r) => r.id);
  if (oids.length) {
    await db.delete(orderLines).where(inArray(orderLines.orderId, oids));
    await db.delete(orders).where(inArray(orders.id, oids));
  }
  await db.delete(salesPayments).where(inArray(salesPayments.organizationId, [orgId, otherOrg]));
  await db.delete(organization).where(inArray(organization.id, [orgId, otherOrg]));
  await db.delete(user).where(eq(user.id, author));
});

describe('tableau de bord ERP', () => {
  it('agrège le CA par mois (factures − avoirs + boutique non facturée), encaissements, achats et marges', async () => {
    const { rows, totals } = await run(dashboardService.revenue(orgId, filters));
    expect(rows.map((r) => r.bucket)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    expect(rows[0]).toMatchObject({ invoicedNet: 10_000, revenueNet: 10_000, revenueGross: 12_000, paid: 12_000, invoices: 1, orders: 0 });
    expect(rows[1]).toMatchObject({
      invoicedNet: 5_000, creditedNet: 1_000, shopNet: 2_500, revenueNet: 6_500, revenueGross: 7_800, paid: 3_000,
      shopCogs: 920, shopMargin: 1_580, invoices: 1, creditNotes: 1, orders: 1, uncostedUnits: 0,
    });
    // Commande DELIVERED liée à la facture C : comptée une seule fois (via la facture).
    expect(rows[2]).toMatchObject({ invoicedNet: 1_000, shopNet: 1_000, revenueNet: 2_000, paid: 3_200, purchases: 4_900, grossMargin: -2_900, orders: 1, uncostedUnits: 1 });
    expect(totals).toMatchObject({ revenueNet: 18_500, paid: 18_200, purchases: 4_900, shopMargin: 2_580 });
  });

  it('regroupe par trimestre et filtre par devise', async () => {
    const q = await run(dashboardService.revenue(orgId, { ...filters, granularity: 'quarter' }));
    expect(q.rows).toHaveLength(1);
    expect(q.rows[0]).toMatchObject({ bucket: '2026-01-01', revenueNet: 18_500 });
    const usd = await run(dashboardService.revenue(orgId, { ...filters, currency: 'USD' }));
    expect(usd.totals).toMatchObject({ revenueNet: 77_000, shopNet: 0, purchases: 0 });
  });

  it('calcule l’encours à date et les commandes en attente non échues', async () => {
    expect(await run(dashboardService.receivables(orgId, 'EUR', '2026-10-27'))).toEqual({
      outstanding: 4_000, overdue: 2_800, openInvoices: 2, overdueInvoices: 1, pendingOrders: 1,
    });
  });

  it('valorise le stock au coût moyen pondéré et signale les articles sous le seuil', async () => {
    const s = await run(dashboardService.stock(orgId, 'EUR', 5));
    const bySku = Object.fromEntries(s.items.map((i) => [i.sku, i]));
    expect(bySku.TEE).toMatchObject({ level: 10, reserved: 3, available: 7, unitCost: 460, valuation: 4_600, low: false });
    expect(bySku.BOLT).toMatchObject({ level: 3, available: 3, unitCost: 100, valuation: 300, low: true });
    expect(bySku.EMPTY).toMatchObject({ level: 0, unitCost: null, valuation: null, low: true });
    expect(s.low.map((i) => i.sku)).toEqual(['EMPTY', 'BOLT']);
    expect(s.totals).toEqual({ items: 3, units: 13, reserved: 3, valuation: 4_900, uncosted: 0, lowCount: 2 });
    expect(s.truncated).toBe(false);
    expect((await run(dashboardService.stock(orgId, 'USD', 5))).totals.valuation).toBe(0);
  });

  it('isole les tenants', async () => {
    const other = await run(dashboardService.revenue(otherOrg, filters));
    expect(other.totals).toMatchObject({ revenueNet: 50_000, paid: 1_000, shopNet: 0, purchases: 0 });
    expect(await run(dashboardService.receivables(otherOrg, 'EUR', '2026-10-27'))).toMatchObject({ outstanding: 60_000, overdue: 60_000, pendingOrders: 0 });
    expect((await run(dashboardService.stock(otherOrg, 'EUR', 5))).items).toEqual([]);
  });
});
