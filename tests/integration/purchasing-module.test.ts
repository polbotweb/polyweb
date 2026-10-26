/** module purchasing — fournisseurs, commandes (BC à l'envoi), réceptions (BR) → entrées de stock logistiques, isolation tenant (base réelle). */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: unknown) => def };
});

import { Effect, Exit } from 'effect';
import { eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { organization, user, purchasingOrderLines, purchasingReceiptLines } from '@database/schemas';
import { logisticsService } from '@/modules/logistics/services/logistics.service';
import { logisticsLoader } from '@/modules/logistics/loaders';
import { purchasingService } from '@/modules/purchasing/services/purchasing.service';

const db = getDrizzle();
const t = `pur-${Date.now().toString(36)}`;
const author = `${t}-author`;
const orgId = `${t}-org`;
const otherOrg = `${t}-other`;
const owner = { userId: author, sessionId: null };
const today = '2026-10-26';
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const failure = async <A, E>(effect: Effect.Effect<A, E>) => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) throw new Error('succès inattendu');
  const reason = exit.cause.reasons.find((r) => r._tag === 'Fail');
  return (reason as { error: { code?: string; message?: string; _tag: string } } | undefined)?.error;
};
const levelOf = async (warehouseId: string, sku: string) =>
  (await run(logisticsLoader.stockLevels(orgId, warehouseId))).find((row) => row.sku === sku)?.level ?? 0;

beforeAll(async () => {
  await db.insert(user).values({ id: author, name: 'Purchasing author', email: `${author}@test.local`, role: 'admin' });
  await db.insert(organization).values([
    { id: orgId, name: 'Purchasing org', slug: orgId, createdAt: new Date() },
    { id: otherOrg, name: 'Purchasing other', slug: otherOrg, createdAt: new Date() },
  ]);
});

afterAll(async () => {
  await db.delete(organization).where(inArray(organization.id, [orgId, otherOrg]));
  await db.delete(user).where(eq(user.id, author));
});

describe('module purchasing', () => {
  let warehouse = '';
  let supplier = '';
  let order = '';

  it('crée des fournisseurs normalisés, code unique par tenant', async () => {
    warehouse = (await run(logisticsService.createWarehouse({ organizationId: orgId, code: 'MAIN', name: 'Principal' }))).id;
    await run(logisticsService.createItem({ organizationId: orgId, sku: 'BOLT-8', name: 'Boulon 8' }));
    await run(logisticsService.createItem({ organizationId: orgId, sku: 'NUT-8', name: 'Écrou 8' }));
    const s = await run(purchasingService.createSupplier({ organizationId: orgId, code: ' acme ', name: 'Acme', email: 'Buy@Acme.TEST', country: 'de' }));
    expect(s).toMatchObject({ code: 'ACME', email: 'buy@acme.test', country: 'DE', paymentTermDays: 30, active: true });
    supplier = s.id;
    expect((await failure(purchasingService.createSupplier({ organizationId: orgId, code: 'ACME', name: 'Doublon' })))?.code).toBe('CONFLICT');
    await run(purchasingService.createSupplier({ organizationId: otherOrg, code: 'ACME', name: 'Autre tenant' }));
    expect((await failure(purchasingService.createSupplier({ organizationId: orgId, code: '??', name: 'X' })))?.code).toBe('BAD_REQUEST');
  });

  it('crée une commande brouillon avec totaux et refuse les références étrangères', async () => {
    const row = await run(purchasingService.createOrder({
      organizationId: orgId, supplierId: supplier, warehouseId: warehouse, currency: 'EUR',
      lines: [{ sku: 'bolt-8', quantity: 10, unitPrice: '0,25' }, { sku: 'NUT-8', quantity: 4, unitPrice: '0.10' }],
    }, author));
    expect(row).toMatchObject({ status: 'DRAFT', number: null, netMinor: 290, currency: 'EUR' });
    order = row.id;
    const lines = await db.select().from(purchasingOrderLines).where(eq(purchasingOrderLines.orderId, order));
    expect(lines.map((l) => [l.sku, l.netMinor])).toEqual([['BOLT-8', 250], ['NUT-8', 40]]);
    expect((await failure(purchasingService.createOrder({ organizationId: otherOrg, supplierId: supplier, warehouseId: warehouse, currency: 'EUR', lines: [{ sku: 'BOLT-8', quantity: 1, unitPrice: '1' }] }, author)))?.code).toBe('NOT_FOUND');
    expect((await failure(purchasingService.createOrder({ organizationId: orgId, supplierId: supplier, warehouseId: warehouse, currency: 'EUR', lines: [{ sku: 'NOPE', quantity: 1, unitPrice: '1' }] }, author)))?.code).toBe('NOT_FOUND');
    expect((await failure(purchasingService.createOrder({ organizationId: orgId, supplierId: supplier, warehouseId: warehouse, currency: 'EUR', lines: [] }, author)))?.code).toBe('BAD_REQUEST');
  });

  it("refuse la réception d'un brouillon puis numérote BC à l'envoi", async () => {
    expect((await failure(purchasingService.receive(order, { lines: [] }, owner, { today })))?.code).toBe('BAD_REQUEST');
    expect((await failure(purchasingService.transition(order, 'RECEIVED', owner)))?.code).toBe('BAD_REQUEST');
    const sent = await run(purchasingService.transition(order, 'SENT', owner, { today }));
    expect(sent.number).toMatch(/^BC-2026-\d{5}$/);
    expect(sent.sentAt).toBeInstanceOf(Date);
    expect((await failure(purchasingService.updateOrder(order, { supplierId: supplier, warehouseId: warehouse, currency: 'EUR', lines: [{ sku: 'BOLT-8', quantity: 1, unitPrice: '1' }] }, owner)))?.code).toBe('BAD_REQUEST');
    expect((await failure(purchasingService.deleteSupplier(supplier)))?.code).toBe('CONFLICT');
  });

  it('réceptionne partiellement puis totalement, avec entrées de stock', async () => {
    const lines = await db.select().from(purchasingOrderLines).where(eq(purchasingOrderLines.orderId, order));
    const bolt = lines.find((l) => l.sku === 'BOLT-8')!;
    const nut = lines.find((l) => l.sku === 'NUT-8')!;
    const first = await run(purchasingService.receive(order, { lines: [{ lineId: bolt.id, quantity: 6 }, { lineId: nut.id, quantity: 0 }], supplierReference: 'DN-1' }, owner, { today }));
    expect(first.order.status).toBe('PARTIALLY_RECEIVED');
    expect(first.receipt.number).toMatch(/^BR-2026-\d{5}$/);
    expect(await levelOf(warehouse, 'BOLT-8')).toBe(6);
    const over = await failure(purchasingService.receive(order, { lines: [{ lineId: bolt.id, quantity: 5 }] }, owner, { today }));
    expect(over?.code).toBe('BAD_REQUEST');
    expect(await levelOf(warehouse, 'BOLT-8')).toBe(6);
    const second = await run(purchasingService.receive(order, { lines: [{ lineId: bolt.id, quantity: 4 }, { lineId: nut.id, quantity: 4 }] }, owner, { today }));
    expect(second.order.status).toBe('RECEIVED');
    expect(second.receipt.number).not.toBe(first.receipt.number);
    expect(await levelOf(warehouse, 'BOLT-8')).toBe(10);
    expect(await levelOf(warehouse, 'NUT-8')).toBe(4);
    const receiptLines = await db.select().from(purchasingReceiptLines).where(inArray(purchasingReceiptLines.receiptId, [first.receipt.id, second.receipt.id]));
    expect(receiptLines).toHaveLength(3);
    expect(receiptLines.every((l) => l.movementId)).toBe(true);
    expect((await failure(purchasingService.receive(order, { lines: [{ lineId: nut.id, quantity: 1 }] }, owner, { today })))?.code).toBe('BAD_REQUEST');
  });

  it('solde, refuse la suppression, et gère annulation / suppression de brouillon', async () => {
    expect((await run(purchasingService.transition(order, 'CLOSED', owner))).status).toBe('CLOSED');
    expect((await failure(purchasingService.deleteOrder(order, owner)))?.code).toBe('BAD_REQUEST');
    const draft = await run(purchasingService.createOrder({ organizationId: orgId, supplierId: supplier, warehouseId: warehouse, currency: 'EUR', lines: [{ sku: 'NUT-8', quantity: 1, unitPrice: '1' }] }, author));
    expect((await run(purchasingService.transition(draft.id, 'CANCELLED', owner))).status).toBe('CANCELLED');
    expect(await run(purchasingService.deleteOrder(draft.id, owner))).toEqual({ id: draft.id });
  });
});
