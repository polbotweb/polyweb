import { describe, expect, it } from 'vitest';
import { Effect, Exit } from 'effect';
import { canTransition } from '@/core/workflow';
import { assignsNumber, isEditable, nextStatuses, shipmentWorkflow, stockEffect } from '@/modules/logistics/domain/workflow';
import { aggregateBySku, ensureAvailable, signedQuantity, stockLevel, validateSku } from '@/modules/logistics/domain/stock';
import { totalUnits, validateShipment, validateWarehouse } from '@/modules/logistics/domain/shipment';

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(effect);
const fails = <A, E>(effect: Effect.Effect<A, E>) => Exit.isFailure(Effect.runSyncExit(effect));

describe('logistics/workflow', () => {
  it('suit le cycle et ferme les statuts finaux', () => {
    expect(canTransition(shipmentWorkflow, 'DRAFT', 'READY')).toBe(true);
    expect(canTransition(shipmentWorkflow, 'DRAFT', 'SHIPPED')).toBe(false);
    expect(canTransition(shipmentWorkflow, 'SHIPPED', 'CANCELLED')).toBe(false);
    expect(nextStatuses('READY')).toEqual(['DRAFT', 'SHIPPED', 'CANCELLED']);
    expect(nextStatuses('CANCELLED')).toEqual([]);
    expect(nextStatuses('RETURNED')).toEqual([]);
    expect(isEditable('DRAFT')).toBe(true);
    expect(isEditable('READY')).toBe(false);
  });
  it('stock : sortie à l’expédition, rentrée au retour ; numéro à READY', () => {
    expect(stockEffect('READY', 'SHIPPED')).toBe('issue');
    expect(stockEffect('SHIPPED', 'RETURNED')).toBe('return');
    expect(stockEffect('DELIVERED', 'RETURNED')).toBe('return');
    expect(stockEffect('DRAFT', 'READY')).toBeNull();
    expect(assignsNumber('DRAFT', 'READY')).toBe(true);
    expect(assignsNumber('READY', 'SHIPPED')).toBe(false);
  });
});

describe('logistics/stock', () => {
  it('signe les quantités selon le type', () => {
    expect(run(signedQuantity('receipt', 5)).delta).toBe(5);
    expect(run(signedQuantity('issue', 5)).delta).toBe(-5);
    expect(run(signedQuantity('shipment', 2)).delta).toBe(-2);
    expect(run(signedQuantity('adjustment', -3)).delta).toBe(-3);
    expect(fails(signedQuantity('issue', -1))).toBe(true);
    expect(fails(signedQuantity('adjustment', 0))).toBe(true);
    expect(fails(signedQuantity('receipt', 1.5))).toBe(true);
    expect(fails(signedQuantity('teleport', 1))).toBe(true);
  });
  it('niveau = somme des mouvements ; refuse le stock négatif', () => {
    expect(stockLevel([{ delta: 10 }, { delta: -4 }, { delta: 1 }])).toBe(7);
    expect(run(ensureAvailable('A', 7, -7))).toBe(0);
    expect(fails(ensureAvailable('A', 7, -8))).toBe(true);
    expect(run(ensureAvailable('A', 0, 3))).toBe(3);
  });
  it('normalise et agrège les SKU', () => {
    expect(run(validateSku(' ab-12 '))).toBe('AB-12');
    expect(fails(validateSku('a b'))).toBe(true);
    expect([...aggregateBySku([{ sku: 'a', quantity: 1 }, { sku: 'A ', quantity: 2 }, { sku: 'b', quantity: 1 }])]).toEqual([['A', 3], ['B', 1]]);
  });
});

describe('logistics/shipment', () => {
  const base = { recipientName: ' ACME ', country: 'fr', weightGrams: 1200, trackingNumber: ' 1Z 999 ', lines: [{ sku: 'sku-1', quantity: 2 }, { sku: 'SKU-2', description: ' Câble ', quantity: 1 }] };
  it('valide et normalise', () => {
    const s = run(validateShipment(base));
    expect(s.recipientName).toBe('ACME');
    expect(s.country).toBe('FR');
    expect(s.trackingNumber).toBe('1Z 999');
    expect(s.lines.map((l) => [l.position, l.sku, l.description])).toEqual([[1, 'SKU-1', null], [2, 'SKU-2', 'Câble']]);
    expect(totalUnits(s.lines)).toBe(3);
  });
  it('refuse les entrées invalides', () => {
    expect(fails(validateShipment({ ...base, recipientName: ' ' }))).toBe(true);
    expect(fails(validateShipment({ ...base, country: 'FRA' }))).toBe(true);
    expect(fails(validateShipment({ ...base, lines: [] }))).toBe(true);
    expect(fails(validateShipment({ ...base, lines: [{ sku: 'X', quantity: 0 }] }))).toBe(true);
    expect(fails(validateShipment({ ...base, weightGrams: -1 }))).toBe(true);
    expect(fails(validateShipment({ ...base, trackingNumber: '<x>' }))).toBe(true);
  });
  it('valide un entrepôt', () => {
    expect(run(validateWarehouse({ code: ' par-1 ', name: 'Paris', country: 'fr' }))).toEqual({ code: 'PAR-1', name: 'Paris', country: 'FR' });
    expect(fails(validateWarehouse({ code: '', name: 'X', country: null }))).toBe(true);
    expect(fails(validateWarehouse({ code: 'A', name: ' ', country: null }))).toBe(true);
  });
});
