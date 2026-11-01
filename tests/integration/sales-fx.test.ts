/**
 * Multi-devise sur les ventes : taux figé à l'émission (forçage manuel de l'organisation), avoir au
 * taux de la facture d'origine, refus sans taux, devise de tenue verrouillée dès la première émission.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect, Exit } from 'effect';
import { and, eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { organization, user, sales } from '@database/schemas';
import { salesService, type SalesDocumentInput } from '@/modules/sales/services/salesDocument.service';
import { fxSettings, setBaseCurrency, setManualRate } from '@/core/fx/service';

const db = getDrizzle();
const t = `salesfx-${Date.now().toString(36)}`;
const author = `${t}-author`;
const orgId = `${t}-org`;
const owner = { userId: author, sessionId: null };
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const DAY = '2026-03-02';
const LATER = '2026-03-09';

const draft = (currency: string): SalesDocumentInput => ({
  kind: 'invoice', organizationId: orgId, title: `${t} ${currency}`, customerName: 'Client FX', customerEmail: 'fx@test.local',
  customerCountry: 'FR', customerType: 'B2C', sellerCountry: 'FR', supplyType: 'services', currency, paymentTermDays: 30,
  lines: [{ description: 'Prestation', quantity: '2', unitPriceMinor: 10000, taxCategory: 'standard' }],
});

beforeAll(async () => {
  await db.insert(user).values({ id: author, name: 'FX author', email: `${author}@test.local`, role: 'admin' });
  await db.insert(organization).values({ id: orgId, name: 'FX org', slug: orgId, createdAt: new Date() });
  await run(setManualRate({ organizationId: orgId, from: 'USD', to: 'EUR', date: DAY, rate: '0.9' }));
  await run(setManualRate({ organizationId: orgId, from: 'USD', to: 'EUR', date: LATER, rate: '0.5' }));
});

afterAll(async () => {
  const ids = (await db.select({ id: sales.id }).from(sales).where(eq(sales.organizationId, orgId))).map((d) => d.id);
  if (ids.length) for (const kind of ['credit_note', 'invoice'] as const) await db.delete(sales).where(and(inArray(sales.id, ids), eq(sales.kind, kind)));
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(eq(user.id, author));
});

describe('ventes multi-devise', () => {
  it('fige la contre-valeur EUR d’une facture USD et verrouille la devise de tenue', async () => {
    const doc = await run(salesService.create(draft('USD'), author, DAY));
    expect(doc.exchangeRate).toBeNull();
    const issued = await run(salesService.transition(doc.id, 'ISSUED', owner, 'fr', DAY));
    expect(issued).toMatchObject({ baseCurrency: 'EUR', exchangeRate: '0.9', exchangeRateDate: DAY, netMinor: 20000, taxMinor: 4000 });
    expect(issued?.netBaseMinor).toBe(18000);
    expect(issued?.taxBaseMinor).toBe(3600);
    expect(issued?.grossBaseMinor).toBe(21600);
    expect((await run(fxSettings(orgId))).lockedAt).not.toBeNull();
    expect(Exit.isFailure(await Effect.runPromiseExit(setBaseCurrency(orgId, 'USD')))).toBe(true);

    const credit = await run(salesService.createCreditNote(issued!.id, author, {}, LATER));
    const creditIssued = await run(salesService.transition(credit.id, 'ISSUED', owner, 'fr', LATER));
    expect(creditIssued).toMatchObject({ exchangeRate: '0.9', exchangeRateDate: DAY, grossBaseMinor: 21600 });
  });

  it('applique le taux 1 dans la devise de tenue', async () => {
    const doc = await run(salesService.create(draft('EUR'), author, DAY));
    const issued = await run(salesService.transition(doc.id, 'ISSUED', owner, 'fr', DAY));
    expect(issued).toMatchObject({ exchangeRate: '1', grossBaseMinor: issued?.grossMinor });
  });

  it('refuse l’émission sans taux disponible (aucun numéro consommé)', async () => {
    const doc = await run(salesService.create(draft('JPY'), author, DAY));
    expect(Exit.isFailure(await Effect.runPromiseExit(salesService.transition(doc.id, 'ISSUED', owner, 'fr', DAY)))).toBe(true);
    const [row] = await db.select().from(sales).where(eq(sales.id, doc.id));
    expect(row).toMatchObject({ status: 'DRAFT', number: null, exchangeRate: null });
  });
});
