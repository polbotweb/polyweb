/**
 * module logistics — inventaires physiques (ouverture, comptage, validation → ajustements d'écart),
 * grand livre de stock filtrable, et cohérence stock ⇔ grand livre sur une séquence aléatoire
 * d'opérations (base réelle).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: unknown) => def };
});

import { Effect, Exit } from 'effect';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { organization, user, logisticsStockMovements, logisticsStockReservations } from '@database/schemas';
import { logisticsService } from '@/modules/logistics/services/logistics.service';
import { inventoryService } from '@/modules/logistics/services/inventory.service';
import { inventoryLoader, logisticsLoader } from '@/modules/logistics/loaders';
import { parseLedgerFilters, type LedgerFilters } from '@/modules/logistics/domain/ledger';

const db = getDrizzle();
const t = `inv-${Date.now().toString(36)}`;
const author = `${t}-author`;
const counter = `${t}-counter`;
const orgId = `${t}-org`;
const otherOrg = `${t}-other`;
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const failure = async <A, E>(effect: Effect.Effect<A, E>) => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) throw new Error('succès inattendu');
  const reason = exit.cause.reasons.find((r) => r._tag === 'Fail');
  return (reason as { error: { code?: string; message?: string; _tag: string } } | undefined)?.error;
};
const filters = (query: Record<string, string> = {}): LedgerFilters => parseLedgerFilters(new URLSearchParams(query));
const levelOf = async (warehouseId: string, sku: string) =>
  (await run(logisticsLoader.stockLevels(orgId, warehouseId))).find((row) => row.sku === sku)?.level ?? 0;

let main = '';
let backup = '';

beforeAll(async () => {
  await db.insert(user).values([
    { id: author, name: 'Inventory author', email: `${author}@test.local`, role: 'admin' },
    { id: counter, name: 'Inventory counter', email: `${counter}@test.local`, role: 'admin' },
  ]);
  await db.insert(organization).values([
    { id: orgId, name: 'Inventory org', slug: orgId, createdAt: new Date() },
    { id: otherOrg, name: 'Inventory other', slug: otherOrg, createdAt: new Date() },
  ]);
  main = (await run(logisticsService.createWarehouse({ organizationId: orgId, code: 'INV-A', name: 'Principal' }))).id;
  backup = (await run(logisticsService.createWarehouse({ organizationId: orgId, code: 'INV-B', name: 'Secours' }))).id;
  for (const sku of ['BOX-1', 'BOX-2', 'CAP_X']) await run(logisticsService.createItem({ organizationId: orgId, sku, name: `Article ${sku}` }));
  await run(logisticsService.recordMovement({ organizationId: orgId, warehouseId: main, sku: 'BOX-1', kind: 'receipt', quantity: 10, reference: 'PO-1' }, author));
  await run(logisticsService.recordMovement({ organizationId: orgId, warehouseId: main, sku: 'BOX-2', kind: 'receipt', quantity: 4 }, author));
});

afterAll(async () => {
  await db.delete(organization).where(inArray(organization.id, [orgId, otherOrg]));
  await db.delete(user).where(inArray(user.id, [author, counter]));
});

describe('inventaires', () => {
  let countId = '';

  it('ouvre un inventaire numéroté avec le stock théorique figé, un seul ouvert par entrepôt', async () => {
    const count = await run(inventoryService.open({ organizationId: orgId, warehouseId: main, note: ' Inventaire annuel ' }, author));
    countId = count.id;
    expect(count).toMatchObject({ status: 'OPEN', note: 'Inventaire annuel', createdBy: author, warehouseId: main });
    expect(count.number).toMatch(/^INV-\d{4}-\d{5}$/);
    const detail = (await run(inventoryLoader.count(countId, orgId)))!;
    expect(detail.lines.map((line) => [line.sku, line.expected, line.counted])).toEqual([['BOX-1', 10, null], ['BOX-2', 4, null], ['CAP_X', 0, null]]);
    expect((await failure(inventoryService.open({ organizationId: orgId, warehouseId: main }, author)))?.code).toBe('CONFLICT');
    // Autre entrepôt : indépendant.
    const other = await run(inventoryService.open({ organizationId: orgId, warehouseId: backup }, author));
    await run(inventoryService.cancel(other.id, orgId));
  });

  it('valide les quantités saisies et borne les lignes à l’inventaire', async () => {
    const detail = (await run(inventoryLoader.count(countId, orgId)))!;
    const [box1, box2] = detail.lines;
    for (const bad of ['-1', 'abc', '1.5', '10000001']) {
      expect((await failure(inventoryService.recordCounts(countId, orgId, [{ lineId: box1!.id, counted: bad }], counter)))?.code).toBe('BAD_REQUEST');
    }
    expect((await failure(inventoryService.recordCounts(countId, orgId, [{ lineId: crypto.randomUUID(), counted: '1' }], counter)))?.code).toBe('NOT_FOUND');
    expect((await failure(inventoryService.recordCounts(countId, orgId, [{ lineId: box1!.id, counted: '1' }, { lineId: box1!.id, counted: '2' }], counter)))?.code).toBe('BAD_REQUEST');
    expect((await failure(inventoryService.recordCounts(countId, otherOrg, [{ lineId: box1!.id, counted: '1' }], counter)))?.code).toBe('NOT_FOUND');
    await run(inventoryService.recordCounts(countId, orgId, [{ lineId: box1!.id, counted: '7' }, { lineId: box2!.id, counted: '9' }], counter));
    // Une saisie vide remet la ligne à « non compté ».
    await run(inventoryService.recordCounts(countId, orgId, [{ lineId: box2!.id, counted: '' }], counter));
    await run(inventoryService.recordCounts(countId, orgId, [{ lineId: box2!.id, counted: 4 }], counter));
    const after = (await run(inventoryLoader.count(countId, orgId)))!;
    expect(after.lines.map((line) => [line.sku, line.counted, line.countedBy])).toEqual([['BOX-1', 7, counter], ['BOX-2', 4, counter], ['CAP_X', null, null]]);
  });

  it('poste à la validation l’écart avec le niveau RÉEL (mouvements survenus entre-temps) ; stock = compté', async () => {
    // Mouvement pendant le comptage : la validation s'aligne sur le compté, pas sur la photo d'ouverture.
    await run(logisticsService.recordMovement({ organizationId: orgId, warehouseId: main, sku: 'BOX-1', kind: 'receipt', quantity: 5 }, author));
    // Réservations supérieures au compté : l'inventaire n'est pas bloqué (le comptage fait foi).
    const items = await run(logisticsLoader.items(orgId));
    const box1 = items.find((item) => item.sku === 'BOX-1')!;
    await db.insert(logisticsStockReservations).values({ organizationId: orgId, warehouseId: main, itemId: box1.id, quantity: 12, reference: `${t}-resa`, expiresAt: new Date(Date.now() + 3_600_000) });
    const result = await run(inventoryService.validate(countId, orgId, author));
    expect(result).toMatchObject({ counted: 2, adjustments: 1, netVariance: -8 });
    expect(await levelOf(main, 'BOX-1')).toBe(7);
    expect(await levelOf(main, 'BOX-2')).toBe(4);
    const detail = (await run(inventoryLoader.count(countId, orgId)))!;
    expect(detail).toMatchObject({ status: 'VALIDATED', validatedBy: author, validatedByName: 'Inventory author', createdByName: 'Inventory author' });
    expect(detail.validatedAt).toBeInstanceOf(Date);
    expect(detail.lines.map((line) => [line.sku, line.expected, line.system, line.variance])).toEqual([['BOX-1', 10, 15, -8], ['BOX-2', 4, 4, 0], ['CAP_X', 0, null, null]]);
    const posted = await db.select().from(logisticsStockMovements).where(eq(logisticsStockMovements.inventoryCountId, countId));
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ kind: 'adjustment', delta: -8, source: 'inventory', reference: detail.number, createdBy: author, warehouseId: main, itemId: box1.id });
    await db.delete(logisticsStockReservations).where(eq(logisticsStockReservations.reference, `${t}-resa`));
  });

  it('fige un inventaire clos (validation, annulation, saisie refusées) et en autorise un nouveau', async () => {
    expect((await failure(inventoryService.validate(countId, orgId, author)))?.code).toBe('BAD_REQUEST');
    expect((await failure(inventoryService.cancel(countId, orgId)))?.code).toBe('BAD_REQUEST');
    const line = (await run(inventoryLoader.count(countId, orgId)))!.lines[0]!;
    expect((await failure(inventoryService.recordCounts(countId, orgId, [{ lineId: line.id, counted: '1' }], counter)))?.code).toBe('BAD_REQUEST');
    const next = await run(inventoryService.open({ organizationId: orgId, warehouseId: main }, author));
    // Aucune ligne comptée : validation refusée.
    expect((await failure(inventoryService.validate(next.id, orgId, author)))?.code).toBe('BAD_REQUEST');
    // Hors tenant : introuvable.
    expect((await failure(inventoryService.validate(next.id, otherOrg, author)))?.code).toBe('NOT_FOUND');
    const cancelled = await run(inventoryService.cancel(next.id, orgId));
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(logisticsStockMovements).where(eq(logisticsStockMovements.inventoryCountId, next.id)) as [{ n: number }];
    expect(n).toBe(0);
    const list = await run(inventoryLoader.counts(orgId, { warehouseId: main }));
    expect(list.map((row) => row.status)).toEqual(['CANCELLED', 'VALIDATED']);
    expect(list[1]).toMatchObject({ lines: 3, counted: 2, discrepancies: 1, warehouseCode: 'INV-A' });
    expect(await run(inventoryLoader.counts(orgId, { status: 'OPEN' }))).toEqual([]);
    expect(await run(inventoryLoader.count(countId, otherOrg))).toBeNull();
  });

  it('refuse l’ouverture sans article ou sur un entrepôt inactif / hors tenant', async () => {
    const empty = await run(logisticsService.createWarehouse({ organizationId: otherOrg, code: 'EMPTY', name: 'Vide' }));
    expect((await failure(inventoryService.open({ organizationId: otherOrg, warehouseId: empty.id }, author)))?.code).toBe('BAD_REQUEST');
    expect((await failure(inventoryService.open({ organizationId: otherOrg, warehouseId: main }, author)))?.code).toBe('NOT_FOUND');
    const idle = await run(logisticsService.createWarehouse({ organizationId: orgId, code: 'IDLE', name: 'Inactif', active: false }));
    expect((await failure(inventoryService.open({ organizationId: orgId, warehouseId: idle.id }, author)))?.code).toBe('BAD_REQUEST');
    expect((await failure(inventoryService.open({ organizationId: orgId, warehouseId: main, note: 'x'.repeat(1001) }, author)))?.code).toBe('BAD_REQUEST');
  });
});

describe('grand livre de stock', () => {
  it('trace source, auteur et horodatage de chaque mouvement', async () => {
    await run(logisticsService.transfer({ organizationId: orgId, fromWarehouseId: main, toWarehouseId: backup, sku: 'BOX-2', quantity: 1, reference: 'TR-1' }, counter));
    const page = await run(inventoryLoader.ledger(orgId, filters()));
    expect(page.total).toBe(page.rows.length);
    // Les deux mouvements d'un transfert partagent le même created_at (même transaction, defaultNow) :
    // l'ordre entre eux n'est départagé que par l'id (UUID aléatoire), donc on les retrouve par type.
    const transfers = page.rows.filter((row) => row.source === 'transfer');
    expect(transfers).toHaveLength(2);
    expect(transfers[0].createdAt.getTime()).toBe(transfers[1].createdAt.getTime());
    const out = transfers.find((row) => row.kind === 'transfer_out');
    const into = transfers.find((row) => row.kind === 'transfer_in');
    expect(out).toMatchObject({ kind: 'transfer_out', source: 'transfer', createdBy: counter, userName: 'Inventory counter', sku: 'BOX-2', warehouseCode: 'INV-A', delta: -1 });
    expect(into).toMatchObject({ kind: 'transfer_in', source: 'transfer', warehouseCode: 'INV-B', delta: 1 });
    const inventory = page.rows.find((row) => row.source === 'inventory')!;
    expect(inventory.inventoryNumber).toMatch(/^INV-/);
    expect(page.rows.every((row) => row.createdAt instanceof Date)).toBe(true);
    expect(page.rows.filter((row) => row.source === 'manual').map((row) => row.kind).sort()).toEqual(['receipt', 'receipt', 'receipt']);
  });

  it('filtre par entrepôt, SKU (préfixe échappé), type, source, utilisateur et dates', async () => {
    const count = async (query: Record<string, string>) => (await run(inventoryLoader.ledger(orgId, filters(query)))).total;
    expect(await count({ warehouse: backup })).toBe(1);
    expect(await count({ sku: 'box-' })).toBe(6);
    expect(await count({ sku: 'BOX-1' })).toBe(3);
    // `_` est littéral (pas un joker LIKE) : « BOX_ » ne correspond pas à « BOX-1 ».
    expect(await count({ sku: 'BOX_' })).toBe(0);
    expect(await count({ kind: 'adjustment' })).toBe(1);
    expect(await count({ source: 'transfer' })).toBe(2);
    expect(await count({ source: 'inventory', warehouse: main })).toBe(1);
    expect(await count({ user: counter })).toBe(2);
    expect(await count({ user: author, kind: 'receipt' })).toBe(3);
    const today = new Date().toISOString().slice(0, 10);
    expect(await count({ from: today, to: today })).toBe(6);
    expect(await count({ to: '2000-01-01' })).toBe(0);
    expect(await count({ from: '2999-01-01' })).toBe(0);
    // Filtres invalides ignorés.
    expect(await count({ warehouse: 'nope', kind: 'drop table', source: 'x', from: '2026-02-30', sku: "'; --" })).toBe(6);
    expect((await run(inventoryLoader.ledger(otherOrg, filters()))).total).toBe(0);
    const users = await run(inventoryLoader.ledgerUsers(orgId));
    expect(users.map((row) => row.id).sort()).toEqual([author, counter].sort());
  });

  it('pagine de façon stable (plus récent d’abord, page bornée)', async () => {
    const all = await run(inventoryLoader.ledger(orgId, filters()));
    const first = await run(inventoryLoader.ledger(orgId, filters(), 4));
    const second = await run(inventoryLoader.ledger(orgId, filters({ page: '2' }), 4));
    const beyond = await run(inventoryLoader.ledger(orgId, filters({ page: '99' }), 4));
    expect(first).toMatchObject({ total: 6, pages: 2, page: 1 });
    expect([...first.rows, ...second.rows].map((row) => row.id)).toEqual(all.rows.map((row) => row.id));
    expect(beyond.page).toBe(2);
    const times = all.rows.map((row) => row.createdAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});

describe('cohérence stock ⇔ grand livre', () => {
  it('niveaux = somme du grand livre = modèle attendu, jamais négatifs, après 120 opérations aléatoires', async () => {
    // PRNG déterministe (mulberry32) : un échec est rejouable.
    let seed = 0x5eed1234;
    const random = () => { seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const pick = <T>(values: readonly T[]) => values[Math.floor(random() * values.length)]!;
    const org = `${t}-prop`;
    await db.insert(organization).values({ id: org, name: 'Inventory property', slug: org, createdAt: new Date() });
    const warehouses = [
      (await run(logisticsService.createWarehouse({ organizationId: org, code: 'P1', name: 'P1' }))).id,
      (await run(logisticsService.createWarehouse({ organizationId: org, code: 'P2', name: 'P2' }))).id,
    ];
    const skus = ['P-A', 'P-B', 'P-C'];
    for (const sku of skus) await run(logisticsService.createItem({ organizationId: org, sku, name: sku }));
    const model = new Map<string, number>();
    const key = (warehouseId: string, sku: string) => `${warehouseId}|${sku}`;
    const get = (warehouseId: string, sku: string) => model.get(key(warehouseId, sku)) ?? 0;
    const add = (warehouseId: string, sku: string, delta: number) => model.set(key(warehouseId, sku), get(warehouseId, sku) + delta);
    let rejected = 0;

    for (let step = 0; step < 120; step += 1) {
      const warehouseId = pick(warehouses);
      const sku = pick(skus);
      const quantity = 1 + Math.floor(random() * 8);
      const op = pick(['receipt', 'receipt', 'issue', 'adjustment', 'transfer', 'inventory'] as const);
      if (op === 'receipt' || op === 'issue') {
        const exit = await Effect.runPromiseExit(logisticsService.recordMovement({ organizationId: org, warehouseId, sku, kind: op, quantity }, author));
        if (op === 'issue' && quantity > get(warehouseId, sku)) { expect(Exit.isFailure(exit)).toBe(true); rejected += 1; continue; }
        expect(Exit.isSuccess(exit)).toBe(true);
        add(warehouseId, sku, op === 'receipt' ? quantity : -quantity);
      } else if (op === 'adjustment') {
        const delta = random() < 0.5 ? quantity : -quantity;
        const exit = await Effect.runPromiseExit(logisticsService.recordMovement({ organizationId: org, warehouseId, sku, kind: 'adjustment', quantity: delta }, author));
        if (get(warehouseId, sku) + delta < 0) { expect(Exit.isFailure(exit)).toBe(true); rejected += 1; continue; }
        expect(Exit.isSuccess(exit)).toBe(true);
        add(warehouseId, sku, delta);
      } else if (op === 'transfer') {
        const to = warehouses.find((id) => id !== warehouseId)!;
        const exit = await Effect.runPromiseExit(logisticsService.transfer({ organizationId: org, fromWarehouseId: warehouseId, toWarehouseId: to, sku, quantity }, author));
        if (quantity > get(warehouseId, sku)) { expect(Exit.isFailure(exit)).toBe(true); rejected += 1; continue; }
        expect(Exit.isSuccess(exit)).toBe(true);
        add(warehouseId, sku, -quantity);
        add(to, sku, quantity);
      } else {
        const count = await run(inventoryService.open({ organizationId: org, warehouseId }, author));
        const lines = (await run(inventoryLoader.count(count.id, org)))!.lines;
        const entries = lines.filter(() => random() < 0.7).map((line) => ({ lineId: line.id, counted: String(Math.floor(random() * 12)) }));
        if (entries.length === 0) { await run(inventoryService.cancel(count.id, org)); continue; }
        await run(inventoryService.recordCounts(count.id, org, entries, author));
        await run(inventoryService.validate(count.id, org, author));
        for (const entry of entries) {
          const line = lines.find((candidate) => candidate.id === entry.lineId)!;
          model.set(key(warehouseId, line.sku), Number(entry.counted));
        }
      }
    }

    const levels = await run(logisticsLoader.stockLevels(org));
    const ledger = await run(inventoryLoader.ledger(org, filters(), 100_000));
    expect(ledger.total).toBe(ledger.rows.length);
    const fromLedger = new Map<string, number>();
    for (const row of ledger.rows) fromLedger.set(key(row.warehouseId, row.sku), (fromLedger.get(key(row.warehouseId, row.sku)) ?? 0) + row.delta);
    for (const warehouseId of warehouses) {
      for (const sku of skus) {
        const level = levels.find((row) => row.warehouseId === warehouseId && row.sku === sku)?.level ?? 0;
        expect({ warehouseId, sku, level }).toEqual({ warehouseId, sku, level: get(warehouseId, sku) });
        expect(fromLedger.get(key(warehouseId, sku)) ?? 0).toBe(level);
        expect(level).toBeGreaterThanOrEqual(0);
      }
    }
    // Chaque mouvement est attribué (auteur, source, horodatage) et non nul.
    expect(ledger.rows.every((row) => row.createdBy === author && row.delta !== 0 && row.source !== null && row.createdAt instanceof Date)).toBe(true);
    // La séquence a bien exercé les refus et les inventaires.
    expect(rejected).toBeGreaterThan(0);
    expect(ledger.rows.some((row) => row.source === 'inventory')).toBe(true);
    // Les inventaires validés figent des écarts cohérents avec leurs mouvements.
    const posted = await db.select({ delta: logisticsStockMovements.delta }).from(logisticsStockMovements).where(and(eq(logisticsStockMovements.organizationId, org), eq(logisticsStockMovements.source, 'inventory')));
    const counts = await run(inventoryLoader.counts(org, { status: 'VALIDATED' }));
    let variance = 0;
    for (const count of counts) variance += (await run(inventoryLoader.count(count.id, org)))!.lines.reduce((sum, line) => sum + (line.variance ?? 0), 0);
    expect(posted.reduce((sum, row) => sum + row.delta, 0)).toBe(variance);
    await db.delete(organization).where(eq(organization.id, org));
  }, 120_000);
});
