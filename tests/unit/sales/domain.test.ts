import { describe, expect, it } from 'vitest';
import { Effect, Exit } from 'effect';
import { canTransition } from '@/core/workflow';
import { formatDocumentNumber } from '@/core/numbering';
import { computeLineNet, computeSalesTotals } from '@/modules/sales/domain/lines';
import { amountDue, invoiceStatusFromBalance, validatePayment } from '@/modules/sales/domain/payments';
import { creditableAmount, validateCreditAmount } from '@/modules/sales/domain/credit';
import { daysOverdue, dueDateFrom, nextReminderLevel } from '@/modules/sales/domain/reminders';
import { DEFAULT_SALES_NUMBERING } from '@/modules/sales/domain/numbering';
import { isLocked, workflowFor } from '@/modules/sales/domain/workflow';

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(effect);
const fails = <A, E>(effect: Effect.Effect<A, E>) => Exit.isFailure(Effect.runSyncExit(effect));
const fr = { sellerCountry: 'FR', buyerCountry: 'FR', customerType: 'B2B', supplyType: 'services' } as const;

describe('sales/workflow', () => {
  it('applique la table de transitions du type de document', () => {
    expect(canTransition(workflowFor('quote'), 'SENT', 'ACCEPTED')).toBe(true);
    expect(canTransition(workflowFor('quote'), 'DRAFT', 'ISSUED')).toBe(false);
    expect(canTransition(workflowFor('invoice'), 'DRAFT', 'ISSUED')).toBe(true);
    expect(canTransition(workflowFor('invoice'), 'ISSUED', 'CANCELLED')).toBe(false);
    expect(canTransition(workflowFor('invoice'), 'ISSUED', 'DRAFT')).toBe(false);
    expect(canTransition(workflowFor('credit_note'), 'ISSUED', 'DRAFT')).toBe(false);
    expect(isLocked('invoice', 'ISSUED')).toBe(true);
    expect(isLocked('invoice', 'DRAFT')).toBe(false);
  });
  it('numérote par défaut FA-AAAA-00001 / AV / DEV', () => {
    expect(run(formatDocumentNumber(DEFAULT_SALES_NUMBERING.invoice, 1, '2026-10-26'))).toBe('FA-2026-00001');
    expect(run(formatDocumentNumber(DEFAULT_SALES_NUMBERING.credit_note, 12, '2026-10-26'))).toBe('AV-2026-00012');
    expect(run(formatDocumentNumber(DEFAULT_SALES_NUMBERING.quote, 3, '2026-10-26'))).toBe('DEV-2026-0003');
  });
});

describe('sales/lines', () => {
  it('calcule le net de ligne avec quantité décimale et remise', () => {
    expect(run(computeLineNet({ description: 'Conseil', quantity: '2.5', unitPriceMinor: 10_000, discountPercent: '10', taxCategory: 'standard' }, 'EUR')).amountMinor).toBe(22_500);
    expect(run(computeLineNet({ description: 'X', quantity: '3', unitPriceMinor: 333, taxCategory: 'standard' }, 'EUR')).amountMinor).toBe(999);
  });
  it('refuse les lignes invalides', () => {
    const base = { description: 'X', quantity: '1', unitPriceMinor: 100, taxCategory: 'standard' } as const;
    expect(fails(computeLineNet({ ...base, quantity: '0' }, 'EUR'))).toBe(true);
    expect(fails(computeLineNet({ ...base, quantity: '-1' }, 'EUR'))).toBe(true);
    expect(fails(computeLineNet({ ...base, unitPriceMinor: -1 }, 'EUR'))).toBe(true);
    expect(fails(computeLineNet({ ...base, discountPercent: '101' }, 'EUR'))).toBe(true);
    expect(fails(computeLineNet({ ...base, description: ' ' }, 'EUR'))).toBe(true);
  });
  it('totalise HT/TVA/TTC avec ventilation par taux (FR 20 % + 10 %)', () => {
    const result = run(computeSalesTotals({
      kind: 'invoice', currency: 'EUR', date: '2026-10-26', context: fr,
      lines: [
        { description: 'Service', quantity: '1', unitPriceMinor: 100_000, taxCategory: 'standard' },
        { description: 'Livre', quantity: '2', unitPriceMinor: 1_000, taxCategory: 'reduced' },
      ],
    }));
    expect(result.totals.net.amountMinor).toBe(102_000);
    expect(result.totals.tax.amountMinor).toBe(20_200);
    expect(result.totals.gross.amountMinor).toBe(122_200);
    expect(result.totals.byRate).toHaveLength(2);
  });
  it('autoliquidation intra-UE B2B : TVA 0 et mention', () => {
    const result = run(computeSalesTotals({
      kind: 'invoice', currency: 'EUR', date: '2026-10-26',
      context: { sellerCountry: 'FR', buyerCountry: 'DE', customerType: 'B2B', buyerVatNumber: 'DE123456789', supplyType: 'services' },
      lines: [{ description: 'Service', quantity: '1', unitPriceMinor: 50_000, taxCategory: 'standard' }],
    }));
    expect(result.totals.tax.amountMinor).toBe(0);
    expect(result.determination.mention).toBe('reverse-charge-services');
  });
  it('refuse un document sans ligne', () => {
    expect(fails(computeSalesTotals({ kind: 'quote', currency: 'EUR', date: '2026-10-26', context: fr, lines: [] }))).toBe(true);
  });
});

describe('sales/payments & credit', () => {
  it('restant dû et statut', () => {
    expect(amountDue({ grossMinor: 1000, paidMinor: 300, creditedMinor: 200 })).toBe(500);
    expect(invoiceStatusFromBalance({ grossMinor: 1000, paidMinor: 0, creditedMinor: 0 })).toBe('ISSUED');
    expect(invoiceStatusFromBalance({ grossMinor: 1000, paidMinor: 300, creditedMinor: 0 })).toBe('PARTIALLY_PAID');
    expect(invoiceStatusFromBalance({ grossMinor: 1000, paidMinor: 800, creditedMinor: 200 })).toBe('PAID');
    expect(invoiceStatusFromBalance({ grossMinor: 1000, paidMinor: 0, creditedMinor: 1000 })).toBe('CREDITED');
  });
  it('valide les encaissements', () => {
    const balance = { grossMinor: 1000, paidMinor: 400, creditedMinor: 0 };
    expect(run(validatePayment('PARTIALLY_PAID', balance, 600))).toBe(600);
    expect(fails(validatePayment('PARTIALLY_PAID', balance, 601))).toBe(true);
    expect(fails(validatePayment('ISSUED', balance, 0))).toBe(true);
    expect(fails(validatePayment('DRAFT', balance, 10))).toBe(true);
  });
  it('plafonne les avoirs au restant créditable', () => {
    expect(creditableAmount(1000, 300)).toBe(700);
    expect(run(validateCreditAmount({ invoiceGrossMinor: 1000, alreadyCreditedMinor: 300, requestedMinor: 700 }))).toBe(700);
    expect(fails(validateCreditAmount({ invoiceGrossMinor: 1000, alreadyCreditedMinor: 300, requestedMinor: 701 }))).toBe(true);
    expect(fails(validateCreditAmount({ invoiceGrossMinor: 1000, alreadyCreditedMinor: 0, requestedMinor: 0 }))).toBe(true);
  });
});

describe('sales/reminders', () => {
  it('échéance et retard', () => {
    expect(run(dueDateFrom('2026-01-31', 30))).toBe('2026-03-02');
    expect(run(daysOverdue('2026-03-02', '2026-03-01'))).toBe(0);
    expect(run(daysOverdue('2026-03-02', '2026-03-12'))).toBe(10);
    expect(fails(dueDateFrom('2026-02-30', 30))).toBe(true);
  });
  it('prochain niveau de relance (J+7, J+15, J+30), un seul envoi à la fois', () => {
    expect(run(nextReminderLevel({ dueDate: '2026-03-01', today: '2026-03-05', sentLevel: 0 }))).toBeNull();
    expect(run(nextReminderLevel({ dueDate: '2026-03-01', today: '2026-03-08', sentLevel: 0 }))).toBe(1);
    expect(run(nextReminderLevel({ dueDate: '2026-03-01', today: '2026-03-08', sentLevel: 1 }))).toBeNull();
    expect(run(nextReminderLevel({ dueDate: '2026-03-01', today: '2026-04-15', sentLevel: 1 }))).toBe(3);
  });
});
