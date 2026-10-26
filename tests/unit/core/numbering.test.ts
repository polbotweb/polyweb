import { describe, expect, it } from 'vitest';
import { Effect, Exit } from 'effect';
import { formatDocumentNumber, numberingPeriod, validatePattern } from '@/core/numbering';

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(effect);
const fails = <A, E>(effect: Effect.Effect<A, E>) => Exit.isFailure(Effect.runSyncExit(effect));

describe('core/numbering format', () => {
  it('formate préfixe, année, mois et séquence complétée', () => {
    expect(run(formatDocumentNumber({ pattern: '{prefix}-{YYYY}-{seq:5}', reset: 'yearly', prefix: 'FA' }, 42, '2026-10-26'))).toBe('FA-2026-00042');
    expect(run(formatDocumentNumber({ pattern: 'AV{YY}{MM}/{seq:3}', reset: 'monthly' }, 7, '2026-03-01T10:00:00Z'))).toBe('AV2603/007');
    expect(run(formatDocumentNumber({ pattern: 'D{seq}', reset: 'never' }, 123456, '2026-01-01'))).toBe('D123456');
  });
  it('période selon la remise à zéro', () => {
    expect(run(numberingPeriod('never', '2026-10-26'))).toBe('');
    expect(run(numberingPeriod('yearly', '2026-10-26'))).toBe('2026');
    expect(run(numberingPeriod('monthly', '2026-10-26'))).toBe('2026-10');
    expect(fails(numberingPeriod('yearly', '26/10/2026'))).toBe(true);
    expect(fails(numberingPeriod('monthly', '2026-13-01'))).toBe(true);
  });
  it('refuse les motifs invalides et les valeurs hors bornes', () => {
    expect(fails(validatePattern('FA-{YYYY}'))).toBe(true);
    expect(fails(validatePattern('{seq}-{seq}'))).toBe(true);
    expect(fails(validatePattern('{seq:0}'))).toBe(true);
    expect(fails(validatePattern('{seq:13}'))).toBe(true);
    expect(fails(validatePattern('{DD}-{seq}'))).toBe(true);
    expect(fails(validatePattern('{YYYY:2}-{seq}'))).toBe(true);
    expect(fails(formatDocumentNumber({ pattern: '{seq}', reset: 'never' }, 0, '2026-01-01'))).toBe(true);
  });
});
