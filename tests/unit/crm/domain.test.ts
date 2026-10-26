import { describe, expect, it } from 'vitest';
import { Effect, Exit } from 'effect';
import { canTransition } from '@/core/workflow';
import { crmWorkflow, nextStages, isOpenStage } from '@/modules/crm/domain/workflow';
import { effectiveProbability, summarizePipeline, validateLostReason, validateOpportunityFigures, weightedAmountMinor } from '@/modules/crm/domain/opportunity';
import { contactDedupKey, contactDisplayName, normalizeCountry, normalizeEmail, normalizePhone, normalizeWebsite, requireName } from '@/modules/crm/domain/contacts';
import { isOverdue, sortActivities, validateActivity } from '@/modules/crm/domain/activities';

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(effect);
const fails = <A, E>(effect: Effect.Effect<A, E>) => Exit.isFailure(Effect.runSyncExit(effect));

describe('crm/workflow', () => {
  it('suit le pipeline et ferme WON', () => {
    expect(canTransition(crmWorkflow, 'NEW', 'QUALIFIED')).toBe(true);
    expect(canTransition(crmWorkflow, 'NEW', 'WON')).toBe(false);
    expect(canTransition(crmWorkflow, 'NEGOTIATION', 'WON')).toBe(true);
    expect(canTransition(crmWorkflow, 'WON', 'NEW')).toBe(false);
    expect(canTransition(crmWorkflow, 'LOST', 'QUALIFIED')).toBe(true);
    expect(nextStages('PROPOSAL')).toEqual(['QUALIFIED', 'NEGOTIATION', 'WON', 'LOST']);
    expect(nextStages('WON')).toEqual([]);
    expect(isOpenStage('NEGOTIATION')).toBe(true);
    expect(isOpenStage('LOST')).toBe(false);
  });
});

describe('crm/opportunity', () => {
  it('valide montant, devise et probabilité', () => {
    expect(run(validateOpportunityFigures({ amountMinor: 1000, currency: 'EUR', probability: null })).amountMinor).toBe(1000);
    expect(fails(validateOpportunityFigures({ amountMinor: -1, currency: 'EUR', probability: null }))).toBe(true);
    expect(fails(validateOpportunityFigures({ amountMinor: 1.5, currency: 'EUR', probability: null }))).toBe(true);
    expect(fails(validateOpportunityFigures({ amountMinor: 1, currency: 'XXX', probability: null }))).toBe(true);
    expect(fails(validateOpportunityFigures({ amountMinor: 1, currency: 'EUR', probability: 101 }))).toBe(true);
  });
  it('exige une raison de perte connue', () => {
    expect(run(validateLostReason('WON', undefined))).toBeNull();
    expect(run(validateLostReason('LOST', 'price'))).toBe('price');
    expect(fails(validateLostReason('LOST', null))).toBe(true);
    expect(fails(validateLostReason('LOST', 'weather'))).toBe(true);
  });
  it('probabilité effective : défaut d’étape, surcharge, bornes WON/LOST', () => {
    expect(effectiveProbability({ stage: 'PROPOSAL', probability: null })).toBe(50);
    expect(effectiveProbability({ stage: 'PROPOSAL', probability: 60 })).toBe(60);
    expect(effectiveProbability({ stage: 'WON', probability: 10 })).toBe(100);
    expect(effectiveProbability({ stage: 'LOST', probability: 90 })).toBe(0);
    expect(weightedAmountMinor({ stage: 'QUALIFIED', amountMinor: 333, currency: 'EUR', probability: null })).toBe(83);
  });
  it('synthétise le pipeline par devise sans les mélanger', () => {
    const [eur, usd] = summarizePipeline([
      { stage: 'NEW', amountMinor: 10000, currency: 'EUR', probability: null },
      { stage: 'NEGOTIATION', amountMinor: 20000, currency: 'EUR', probability: null },
      { stage: 'WON', amountMinor: 5000, currency: 'EUR', probability: null },
      { stage: 'LOST', amountMinor: 7000, currency: 'EUR', probability: null },
      { stage: 'LOST', amountMinor: 1, currency: 'EUR', probability: null },
      { stage: 'PROPOSAL', amountMinor: 999, currency: 'USD', probability: null },
    ]);
    expect(eur!.currency).toBe('EUR');
    expect(eur!.openAmountMinor).toBe(30000);
    expect(eur!.forecastMinor).toBe(1000 + 15000);
    expect(eur!.wonAmountMinor).toBe(5000);
    expect(eur!.winRate).toBe(33);
    expect(eur!.stages.find((s) => s.stage === 'LOST')!.count).toBe(2);
    expect(usd!.forecastMinor).toBe(500);
    expect(usd!.winRate).toBeNull();
    expect(summarizePipeline([])).toEqual([]);
  });
});

describe('crm/contacts', () => {
  it('normalise e-mail, téléphone, site et pays', () => {
    expect(run(normalizeEmail('  Ana@Example.COM '))).toBe('ana@example.com');
    expect(run(normalizeEmail(''))).toBeNull();
    expect(fails(normalizeEmail('pas-un-mail'))).toBe(true);
    expect(run(normalizePhone('01 23 45-67.89'))).toBe('0123456789');
    expect(run(normalizePhone('0033 1 23 45 67 89'))).toBe('+33123456789');
    expect(fails(normalizePhone('12'))).toBe(true);
    expect(run(normalizeWebsite('example.com'))).toBe('https://example.com/');
    expect(fails(normalizeWebsite('localhost'))).toBe(true);
    expect(run(normalizeCountry('fr'))).toBe('FR');
    expect(fails(normalizeCountry('FRA'))).toBe(true);
    expect(fails(requireName('   '))).toBe(true);
  });
  it('nom affiché et clé de dédoublonnage', () => {
    expect(contactDisplayName({ firstName: ' Zoé ', lastName: 'Martin' })).toBe('Zoé Martin');
    expect(contactDisplayName({ firstName: null, lastName: 'Martin' })).toBe('Martin');
    expect(contactDedupKey({ email: 'A@B.fr', lastName: 'x' })).toBe('email:a@b.fr');
    expect(contactDedupKey({ firstName: 'Zoé', lastName: 'MARTIN' })).toBe(contactDedupKey({ firstName: 'zoe', lastName: 'martin' }));
  });
});

describe('crm/activities', () => {
  const base = { kind: 'task', subject: ' Rappeler ', dueAt: new Date('2026-10-01T10:00:00Z'), opportunityId: 'o1', contactId: null, companyId: null };
  it('valide type, sujet, cible et échéance', () => {
    expect(run(validateActivity(base)).subject).toBe('Rappeler');
    expect(fails(validateActivity({ ...base, kind: 'fax' }))).toBe(true);
    expect(fails(validateActivity({ ...base, subject: ' ' }))).toBe(true);
    expect(fails(validateActivity({ ...base, opportunityId: null }))).toBe(true);
    expect(fails(validateActivity({ ...base, kind: 'note' }))).toBe(true);
    expect(run(validateActivity({ ...base, kind: 'note', dueAt: null })).kind).toBe('note');
  });
  it('retard et tri', () => {
    const now = new Date('2026-10-26T00:00:00Z');
    const late = { id: 'late', dueAt: new Date('2026-10-01'), doneAt: null, createdAt: new Date('2026-09-01') };
    const soon = { id: 'soon', dueAt: new Date('2026-11-01'), doneAt: null, createdAt: new Date('2026-09-02') };
    const note = { id: 'note', dueAt: null, doneAt: null, createdAt: new Date('2026-10-20') };
    const done = { id: 'done', dueAt: new Date('2026-09-01'), doneAt: new Date('2026-09-02'), createdAt: new Date('2026-08-01') };
    expect(isOverdue(late, now)).toBe(true);
    expect(isOverdue(soon, now)).toBe(false);
    expect(isOverdue(done, now)).toBe(false);
    expect(sortActivities([note, done, soon, late]).map((a) => a.id)).toEqual(['late', 'soon', 'note', 'done']);
  });
});
