import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import {
  registerInternalLinkResolver,
  resolveInternalLinkEffect,
  searchInternalLinksEffect,
} from '@/lib/content/internal-link-resolver';

registerInternalLinkResolver({
  name: 'test-effect',
  resolve: async (target) => ({ href: `/fr/x/${target}`, title: target, exists: true }),
  listValidTargets: async () => new Set(['a']),
  search: async () => {
    throw new Error('search down');
  },
});

describe('registre des liens internes (vue Effect)', () => {
  it('résout via le résolveur enregistré', async () => {
    const r = await Effect.runPromise(resolveInternalLinkEffect('test-effect', 'a', { locale: 'fr' }));
    expect(r).toEqual({ href: '/fr/x/a', title: 'a', exists: true });
  });

  it('NotFoundError pour un résolveur inconnu', async () => {
    const r = await Effect.runPromise(Effect.result(resolveInternalLinkEffect('nope', 'a', { locale: 'fr' })));
    expect(r._tag === 'Failure' && r.failure._tag).toBe('NotFoundError');
  });

  it("DbError avec la cause d'origine si le résolveur échoue", async () => {
    const r = await Effect.runPromise(Effect.result(searchInternalLinksEffect('test-effect', 'q', { locale: 'fr' })));
    expect(r._tag === 'Failure' && r.failure._tag).toBe('DbError');
  });
});
