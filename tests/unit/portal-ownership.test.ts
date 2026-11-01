/** Portail client : règles pures de rattachement (e-mail vérifié, casse) et références de paiement possédées. */
import { describe, expect, it } from 'vitest';
import { canAttachByEmail, normalizeEmail, ownedPaymentReferences, PORTAL_SALES_KINDS, PORTAL_SALES_STATUSES } from '@/modules/portal/domain/ownership';
import { fill, getPortalTranslations } from '@/modules/portal/i18n';
import { portalPaths, PORTAL_TARGETS } from '@/modules/portal/public/links';
import { LOCALES } from '@i18n/config';

describe('portal ownership rules', () => {
  it('normalise les e-mails (trim + casse), vide → null', () => {
    expect(normalizeEmail('  Ada@Example.TEST ')).toBe('ada@example.test');
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });

  it("rattache uniquement un compte VÉRIFIÉ dont l'e-mail correspond (insensible à la casse)", () => {
    expect(canAttachByEmail({ email: 'ada@example.test', emailVerified: true }, 'ADA@example.test ')).toBe(true);
    expect(canAttachByEmail({ email: 'ada@example.test', emailVerified: false }, 'ada@example.test')).toBe(false);
    expect(canAttachByEmail({ email: 'ada@example.test', emailVerified: true }, 'bob@example.test')).toBe(false);
    expect(canAttachByEmail({ email: 'ada@example.test', emailVerified: true }, null)).toBe(false);
    expect(canAttachByEmail({ email: '', emailVerified: true }, '')).toBe(false);
  });

  it('références de paiement <purpose>:<id> par type', () => {
    expect(ownedPaymentReferences({ invoiceIds: ['i1'], orderIds: ['o1'], bookingIds: ['b1'] })).toEqual(['sales-invoice:i1', 'shop-order:o1', 'booking:b1']);
    expect(ownedPaymentReferences({ invoiceIds: [], orderIds: [], bookingIds: [] })).toEqual([]);
  });

  it("n'expose ni brouillons ni devis", () => {
    expect(PORTAL_SALES_KINDS).not.toContain('quote');
    expect(PORTAL_SALES_STATUSES).not.toContain('DRAFT');
  });
});

describe('portal links & i18n', () => {
  it('chemins du portail encodés', () => {
    expect(portalPaths.home('fr')).toBe('/fr/account');
    expect(portalPaths.invoicePdf('en', 'a/b')).toBe('/en/account/invoices/a%2Fb/pdf');
    expect(portalPaths.invoicePay('es', 'x')).toBe('/es/account/invoices/x/pay');
    expect(portalPaths.order('ar', 'x')).toBe('/ar/account/orders/x');
    expect(portalPaths.booking('fr', 'x')).toBe('/fr/account/bookings/x');
    expect(PORTAL_TARGETS).toEqual(['invoice-pay', 'order', 'booking']);
  });

  it('traductions complètes dans les 4 locales', () => {
    const keys = Object.keys(getPortalTranslations('fr')).sort();
    for (const locale of LOCALES) {
      const t = getPortalTranslations(locale);
      expect(Object.keys(t).sort()).toEqual(keys);
      for (const value of Object.values(t)) expect(value).toBeTruthy();
      expect(fill(t.pay, { ref: 'F-1' })).toContain('F-1');
    }
  });
});
