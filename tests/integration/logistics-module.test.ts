/** module logistics — entrepôts, articles, journal de stock, transferts, expéditions (BL, sortie / retour de stock), isolation tenant (base réelle). */
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
import { organization, user, logisticsShipmentRevisions } from '@database/schemas';
import { logisticsService } from '@/modules/logistics/services/logistics.service';
import { logisticsLoader } from '@/modules/logistics/loaders';

const db = getDrizzle();
const t = `log-${Date.now().toString(36)}`;
const author = `${t}-author`;
const orgId = `${t}-org`;
const otherOrg = `${t}-other`;
const owner = { userId: author, sessionId: null };
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
  await db.insert(user).values({ id: author, name: 'Logistics author', email: `${author}@test.local`, role: 'admin' });
  await db.insert(organization).values([
    { id: orgId, name: 'Logistics org', slug: orgId, createdAt: new Date() },
    { id: otherOrg, name: 'Logistics other', slug: otherOrg, createdAt: new Date() },
  ]);
});

afterAll(async () => {
  // La suppression des organisations doit emporter tout le module (FK « no action » vérifiées en fin d'instruction).
  await db.delete(organization).where(inArray(organization.id, [orgId, otherOrg]));
  await db.delete(user).where(eq(user.id, author));
});

describe('module logistics', () => {
  let main = '';
  let backup = '';

  it('crée des entrepôts normalisés, code unique par tenant', async () => {
    const wh = await run(logisticsService.createWarehouse({ organizationId: orgId, code: ' par-1 ', name: 'Paris', country: 'fr' }));
    expect(wh).toMatchObject({ code: 'PAR-1', country: 'FR', active: true });
    main = wh.id;
    backup = (await run(logisticsService.createWarehouse({ organizationId: orgId, code: 'LYO', name: 'Lyon' }))).id;
    expect((await failure(logisticsService.createWarehouse({ organizationId: orgId, code: 'par-1', name: 'Doublon' })))?.code).toBe('CONFLICT');
    await run(logisticsService.createWarehouse({ organizationId: otherOrg, code: 'PAR-1', name: 'Autre tenant' }));
    expect((await failure(logisticsService.createWarehouse({ organizationId: orgId, code: '??', name: 'X' })))?.code).toBe('BAD_REQUEST');
  });

  it('tient le journal de stock et refuse un stock négatif', async () => {
    await run(logisticsService.createItem({ organizationId: orgId, sku: 'tee-m', name: 'T-shirt M' }));
    expect((await failure(logisticsService.createItem({ organizationId: orgId, sku: 'TEE-M', name: 'Doublon' })))?.code).toBe('CONFLICT');
    await run(logisticsService.recordMovement({ organizationId: orgId, warehouseId: main, sku: 'TEE-M', kind: 'receipt', quantity: 10, reference: 'PO-1' }, author));
    await run(logisticsService.recordMovement({ organizationId: orgId, warehouseId: main, sku: 'tee-m', kind: 'issue', quantity: 3 }, author));
    await run(logisticsService.recordMovement({ organizationId: orgId, warehouseId: main, sku: 'TEE-M', kind: 'adjustment', quantity: -1 }, author));
    expect(await levelOf(main, 'TEE-M')).toBe(6);
    const short = await failure(logisticsService.recordMovement({ organizationId: orgId, warehouseId: main, sku: 'TEE-M', kind: 'issue', quantity: 7 }, author));
    expect(short?.code).toBe('BAD_REQUEST');
    expect(short?.message).toContain('Stock insuffisant');
    expect((await failure(logisticsService.recordMovement({ organizationId: orgId, warehouseId: main, sku: 'TEE-M', kind: 'shipment', quantity: 1 }, author)))?.code).toBe('BAD_REQUEST');
    expect((await failure(logisticsService.recordMovement({ organizationId: otherOrg, warehouseId: main, sku: 'TEE-M', kind: 'receipt', quantity: 1 }, author)))?.code).toBe('NOT_FOUND');
  });

  it('transfère entre entrepôts dans une transaction', async () => {
    await run(logisticsService.transfer({ organizationId: orgId, fromWarehouseId: main, toWarehouseId: backup, sku: 'TEE-M', quantity: 2 }, author));
    expect(await levelOf(main, 'TEE-M')).toBe(4);
    expect(await levelOf(backup, 'TEE-M')).toBe(2);
    expect((await failure(logisticsService.transfer({ organizationId: orgId, fromWarehouseId: backup, toWarehouseId: main, sku: 'TEE-M', quantity: 5 }, author)))?.code).toBe('BAD_REQUEST');
    expect(await levelOf(backup, 'TEE-M')).toBe(2);
  });

  it('numérote le BL à READY, sort le stock à SHIPPED et le rentre à RETURNED', async () => {
    const lines = [{ sku: 'tee-m', quantity: 1 }, { sku: 'TEE-M', quantity: 2, description: 'Lot' }];
    const shipment = await run(logisticsService.createShipment({ organizationId: orgId, warehouseId: main, recipientName: 'Zoé Martin', country: 'fr', lines }, author));
    expect(shipment).toMatchObject({ status: 'DRAFT', number: null, country: 'FR', title: 'Zoé Martin (FR)' });
    expect(await run(logisticsService.lines(shipment.id))).toHaveLength(2);
    expect((await failure(logisticsService.transition(shipment.id, 'SHIPPED', owner)))?.code).toBe('BAD_REQUEST');
    const ready = await run(logisticsService.transition(shipment.id, 'READY', owner, { today: '2026-10-26' }));
    expect(ready.number).toMatch(/^BL-2026-\d{5}$/);
    // retour en brouillon puis READY : le numéro est conservé (pas de trou)
    await run(logisticsService.transition(shipment.id, 'DRAFT', owner));
    expect((await run(logisticsService.transition(shipment.id, 'READY', owner, { today: '2026-10-26' }))).number).toBe(ready.number);
    expect((await failure(logisticsService.updateShipment(shipment.id, { warehouseId: main, recipientName: 'X', country: 'FR', lines }, owner)))?.code).toBe('BAD_REQUEST');
    const shipped = await run(logisticsService.transition(shipment.id, 'SHIPPED', owner));
    expect(shipped.shippedAt).toBeInstanceOf(Date);
    expect(await levelOf(main, 'TEE-M')).toBe(1);
    await run(logisticsService.updateTracking(shipment.id, { carrier: 'Colissimo', trackingNumber: '6A12345678901' }, owner));
    await run(logisticsService.transition(shipment.id, 'DELIVERED', owner));
    await run(logisticsService.transition(shipment.id, 'RETURNED', owner));
    expect(await levelOf(main, 'TEE-M')).toBe(4);
    expect((await failure(logisticsService.deleteShipment(shipment.id, owner)))?.code).toBe('BAD_REQUEST');
    const revisions = await db.select().from(logisticsShipmentRevisions).where(eq(logisticsShipmentRevisions.resourceId, shipment.id));
    expect(revisions.length).toBeGreaterThanOrEqual(8);
  });

  it('refuse l’expédition si le stock ne suffit plus au moment du départ', async () => {
    const shipment = await run(logisticsService.createShipment({ organizationId: orgId, warehouseId: backup, recipientName: 'Client', country: 'BE', lines: [{ sku: 'TEE-M', quantity: 3 }] }, author));
    await run(logisticsService.transition(shipment.id, 'READY', owner));
    const short = await failure(logisticsService.transition(shipment.id, 'SHIPPED', owner));
    expect(short?.code).toBe('BAD_REQUEST');
    expect(await levelOf(backup, 'TEE-M')).toBe(2);
    await run(logisticsService.transition(shipment.id, 'CANCELLED', owner));
    expect(await run(logisticsService.deleteShipment(shipment.id, owner))).toEqual({ id: shipment.id });
  });

  it('refuse les références hors tenant et protège les entrepôts utilisés', async () => {
    expect((await failure(logisticsService.createShipment({ organizationId: otherOrg, warehouseId: main, recipientName: 'X', country: 'FR', lines: [{ sku: 'TEE-M', quantity: 1 }] }, author)))?.code).toBe('NOT_FOUND');
    expect((await failure(logisticsService.createShipment({ organizationId: orgId, warehouseId: main, recipientName: 'X', country: 'FR', lines: [{ sku: 'INCONNU', quantity: 1 }] }, author)))?.code).toBe('NOT_FOUND');
    expect((await failure(logisticsService.deleteWarehouse(main)))?.code).toBe('CONFLICT');
    const empty = await run(logisticsService.createWarehouse({ organizationId: orgId, code: 'TMP', name: 'Temporaire' }));
    expect(await run(logisticsService.deleteWarehouse(empty.id))).toEqual({ id: empty.id });
  });
});
