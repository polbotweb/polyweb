/** Lien de paiement de facture : jeton HMAC lié à la facture, comparaison stricte, chemin encodé, factures payables. */
import { describe, expect, it } from 'vitest';
import { isPayableInvoice, payLinkPath, payLinkToken, verifyPayLinkToken } from '@/modules/sales/payments';

const base = { kind: 'invoice' as const, status: 'ISSUED' as const, grossMinor: 1000, paidMinor: 0, creditedMinor: 0 };

describe('sales pay-link', () => {
  it('jeton déterministe, 32 caractères base64url, lié au secret et à la facture', () => {
    const token = payLinkToken('s', 'inv-1');
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(payLinkToken('s', 'inv-1')).toBe(token);
    expect(payLinkToken('s', 'inv-2')).not.toBe(token);
    expect(payLinkToken('t', 'inv-1')).not.toBe(token);
  });

  it('vérification : refuse jeton absent, tronqué, altéré ou d’une autre facture', () => {
    const token = payLinkToken('s', 'inv-1');
    expect(verifyPayLinkToken('s', 'inv-1', token)).toBe(true);
    for (const bad of [null, undefined, '', token.slice(1), `${token}x`, `${token.slice(0, 31)}${token[31] === 'A' ? 'B' : 'A'}`]) expect(verifyPayLinkToken('s', 'inv-1', bad)).toBe(false);
    expect(verifyPayLinkToken('s', 'inv-2', token)).toBe(false);
  });

  it('chemin public encodé', () => {
    expect(payLinkPath('fr', 'a/b', 'x+y')).toBe('/fr/pay/invoice/a%2Fb?t=x%2By');
  });

  it('payable : facture émise ou partiellement payée avec restant dû', () => {
    expect(isPayableInvoice(base)).toBe(true);
    expect(isPayableInvoice({ ...base, status: 'PARTIALLY_PAID', paidMinor: 400 })).toBe(true);
    expect(isPayableInvoice({ ...base, status: 'PAID', paidMinor: 1000 })).toBe(false);
    expect(isPayableInvoice({ ...base, status: 'DRAFT' })).toBe(false);
    expect(isPayableInvoice({ ...base, kind: 'quote' })).toBe(false);
    expect(isPayableInvoice({ ...base, creditedMinor: 1000 })).toBe(false);
  });
});
