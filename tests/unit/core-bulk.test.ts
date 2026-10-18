import { describe, expect, it } from 'vitest';
import { Effect, Exit } from 'effect';
import { BulkActionError, chunkItems, runBulkAction, validateSelection, bulkOperationUi, type BulkActionSpec } from '@/core/bulk';
import { clear, emptySelection, pageCheckState, selectedIds, toggle, togglePage } from '@/core/bulk/selection';

type Row = { id: string; status: string };
type Tx = { writes: string[] };

function harness(rows: Row[], opts: { failOn?: string; forbid?: boolean; guardFail?: boolean } = {}) {
  const committed: string[] = [];
  const audits: Array<{ action: string; resourceId: string; metadata: Record<string, unknown> }> = [];
  let afterCommit = 0;
  const spec: BulkActionSpec<Row, 'publish' | 'delete', Tx, { id: string }, string, never, string> = {
    resource: 'things',
    maxItems: 3,
    batchSize: 2,
    operations: {
      publish: { validate: (r) => (r.status === 'ARCHIVED' ? `transition invalide ${r.id}` : null), apply: async (tx, r) => { if (r.id === opts.failOn) throw new Error('boom'); tx.writes.push(r.id); }, auditAction: 'THING_PUBLISH' },
      delete: { apply: async (tx, r) => { tx.writes.push(r.id); }, auditAction: 'THING_DELETE', destructive: true },
    },
    authorize: () => (opts.forbid ? Effect.fail('FORBIDDEN_BY_MODULE') : Effect.succeed({ id: 'u1' })),
    load: (ids) => Effect.succeed(rows.filter((r) => ids.includes(r.id))),
    guard: () => (opts.guardFail ? Effect.fail('LOCKED') : Effect.void),
    transaction: async (body) => { const tx: Tx = { writes: [] }; const r = await body(tx); committed.push(...tx.writes); return r; },
    audit: (_a, action, e) => audits.push({ action, resourceId: e.resourceId, metadata: e.metadata }),
    afterCommit: () => { afterCommit++; },
  };
  return { spec, committed, audits, afterCommit: () => afterCommit };
}

const run = <A, E>(e: Effect.Effect<A, E>) => Effect.runPromiseExit(e);
const failure = (exit: Exit.Exit<unknown, unknown>) => (Exit.isFailure(exit) ? exit.cause.reasons.find((r) => r._tag === 'Fail') : undefined);
const err = (exit: Exit.Exit<unknown, unknown>) => { const f = failure(exit); return f && f._tag === 'Fail' ? f.error : undefined; };

describe('core/bulk — runBulkAction', () => {
  const rows = [{ id: 'a', status: 'DRAFT' }, { id: 'b', status: 'DRAFT' }, { id: 'c', status: 'DRAFT' }];

  it('applique en une transaction par lots, audite chaque ligne avec un batchId commun, puis afterCommit', async () => {
    const h = harness(rows);
    const exit = await run(runBulkAction(h.spec, { ids: ['a', 'b', 'c'], operation: 'publish' }));
    expect(Exit.isSuccess(exit) && exit.value.updated).toBe(3);
    expect(h.committed).toEqual(['a', 'b', 'c']);
    expect(h.audits.map((a) => a.resourceId)).toEqual(['a', 'b', 'c']);
    expect(new Set(h.audits.map((a) => a.metadata.batchId)).size).toBe(1);
    expect(h.audits[0]!.metadata).toMatchObject({ bulk: true, operation: 'publish', count: 3 });
    expect(h.afterCommit()).toBe(1);
  });

  it('refuse sélection vide, doublons, dépassement de maxItems — sans rien écrire', async () => {
    for (const ids of [[], ['a', 'a'], ['a', 'b', 'c', 'd']]) {
      const h = harness(rows);
      const e = err(await run(runBulkAction(h.spec, { ids, operation: 'publish' })));
      expect(e).toBeInstanceOf(BulkActionError);
      expect((e as BulkActionError).code).toBe('BAD_REQUEST');
      expect(h.committed).toEqual([]);
    }
  });

  it('propage le refus de permission du module', async () => {
    const h = harness(rows, { forbid: true });
    expect(err(await run(runBulkAction(h.spec, { ids: ['a'], operation: 'publish' })))).toBe('FORBIDDEN_BY_MODULE');
    expect(h.committed).toEqual([]);
  });

  it('élément hors périmètre → FORBIDDEN global (aucune écriture partielle)', async () => {
    const h = harness(rows);
    const e = err(await run(runBulkAction(h.spec, { ids: ['a', 'zz'], operation: 'publish' }))) as BulkActionError;
    expect(e.code).toBe('FORBIDDEN');
    expect(h.committed).toEqual([]);
  });

  it('garde (verrou) en échec → rien n’est écrit', async () => {
    const h = harness(rows, { guardFail: true });
    expect(err(await run(runBulkAction(h.spec, { ids: ['a'], operation: 'publish' })))).toBe('LOCKED');
    expect(h.committed).toEqual([]);
  });

  it('valide toutes les lignes avant écriture et liste les rejets', async () => {
    const h = harness([...rows.slice(0, 2), { id: 'c', status: 'ARCHIVED' }]);
    const e = err(await run(runBulkAction(h.spec, { ids: ['a', 'b', 'c'], operation: 'publish' }))) as BulkActionError;
    expect(e.code).toBe('BAD_REQUEST');
    expect(e.rejected).toEqual([{ id: 'c', reason: 'transition invalide c' }]);
    expect(h.committed).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it('échec en cours de transaction → annulation complète, pas d’audit ni afterCommit', async () => {
    const h = harness(rows, { failOn: 'c' });
    const e = err(await run(runBulkAction(h.spec, { ids: ['a', 'b', 'c'], operation: 'publish' }))) as BulkActionError;
    expect(e.code).toBe('INTERNAL_SERVER_ERROR');
    expect(h.committed).toEqual([]);
    expect(h.audits).toEqual([]);
    expect(h.afterCommit()).toBe(0);
  });

  it('expose les besoins de confirmation UI par opération', () => {
    const h = harness(rows);
    expect(bulkOperationUi(h.spec.operations, 'delete').requiresConfirmation).toBe(true);
    expect(bulkOperationUi(h.spec.operations, 'publish').requiresConfirmation).toBe(false);
  });

  it('utilitaires : validateSelection, chunkItems', async () => {
    expect(Exit.isSuccess(await run(validateSelection(['x'])))).toBe(true);
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(() => chunkItems([1], 0)).toThrow();
  });
});

describe('core/bulk/selection', () => {
  it('bascule, page entière bornée par max, état mixte, vidage', () => {
    let s = emptySelection(3);
    s = toggle(s, 'a');
    expect(pageCheckState(s, ['a', 'b'])).toBe('mixed');
    s = togglePage(s, ['a', 'b', 'c', 'd']);
    expect(selectedIds(s).sort()).toEqual(['a', 'b', 'c']);
    s = togglePage(s, ['a', 'b', 'c']);
    expect(selectedIds(s)).toEqual([]);
    s = toggle(toggle(s, 'x'), 'x');
    expect(pageCheckState(s, ['x'])).toBe(false);
    expect(selectedIds(clear(toggle(s, 'y')))).toEqual([]);
  });
});
