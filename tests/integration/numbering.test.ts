/** core/numbering — séquences sans trou : concurrence, rollback, périodes et tenants (base réelle). */
import { afterAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { like } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { documentSequences } from '@database/schemas';
import { assignDocumentNumber, nextSequenceValue } from '@/core/numbering';

const key = `test-${Date.now()}`;

afterAll(async () => {
  await getDrizzle().delete(documentSequences).where(like(documentSequences.key, `${key}%`));
});

describe('core/numbering service', () => {
  it('attribue des valeurs consécutives sans doublon en concurrence', async () => {
    const db = getDrizzle();
    const values = await Promise.all(Array.from({ length: 20 }, () => db.transaction((tx) => Effect.runPromise(nextSequenceValue(tx, { organizationId: null, key, period: '' })))));
    expect([...values].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("un rollback n'emporte aucun numéro (sans trou)", async () => {
    const db = getDrizzle();
    const scheme = { pattern: 'FA-{YYYY}-{seq:4}', reset: 'yearly' as const };
    await expect(db.transaction(async (tx) => {
      await Effect.runPromise(assignDocumentNumber(tx, { organizationId: null, key: `${key}-inv`, scheme, date: '2026-05-01' }));
      throw new Error('échec de création du document');
    })).rejects.toThrow();
    const first = await db.transaction((tx) => Effect.runPromise(assignDocumentNumber(tx, { organizationId: null, key: `${key}-inv`, scheme, date: '2026-05-01' })));
    expect(first).toEqual({ value: 1, period: '2026', number: 'FA-2026-0001' });
    const nextYear = await Effect.runPromise(assignDocumentNumber(db, { organizationId: null, key: `${key}-inv`, scheme, date: '2027-01-02' }));
    expect(nextYear.number).toBe('FA-2027-0001');
    const again = await Effect.runPromise(assignDocumentNumber(db, { organizationId: null, key: `${key}-inv`, scheme, date: '2026-12-31' }));
    expect(again.number).toBe('FA-2026-0002');
  });
});
