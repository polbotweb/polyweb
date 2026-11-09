/** Registre de modération, empreinte des signaleurs, nettoyage des textes et règles de transition. */
import { afterEach, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { clearModerationTargetsForTests, defineModuleModeration, getModerationTarget, listModerationTargets, moderationTargetKey, registerModuleModeration, type ModerationTargetAdapter } from '@/core/moderation/registry';
import { reporterKey } from '@/core/moderation/reporter-key';
import { cleanModerationText } from '@/core/moderation/service';
import { blogEngagementTransition } from '@/modules/blog/moderation/adapters';
import { serviceEngagementTransition } from '@/modules/services/moderation/adapters';

const adapter = (over: Partial<ModerationTargetAdapter> = {}): ModerationTargetAdapter => ({
  type: 'item', permission: { probe: ['moderate'] }, reporters: 'anyone',
  load: () => Effect.succeed(null), excerpt: () => Effect.succeed(null), ...over,
}) as ModerationTargetAdapter;

describe('registre de modération', () => {
  afterEach(() => clearModerationTargetsForTests());

  it('enregistre les cibles sous la clé module.type', () => {
    registerModuleModeration(defineModuleModeration('probe', [adapter(), adapter({ type: 'note', apply: () => Effect.succeed(null) as never })]));
    expect(moderationTargetKey('probe', 'item')).toBe('probe.item');
    expect(getModerationTarget('probe.item')).toMatchObject({ module: 'probe', key: 'probe.item', reporters: 'anyone' });
    expect(listModerationTargets().map((t) => t.key)).toEqual(['probe.item', 'probe.note']);
    expect(getModerationTarget('probe.missing')).toBeUndefined();
  });

  it('refuse noms invalides et cibles sans permission', () => {
    expect(() => registerModuleModeration(defineModuleModeration('Bad Name', [adapter()]))).toThrow(/module/);
    expect(() => registerModuleModeration(defineModuleModeration('probe', [adapter({ type: 'x.y' })]))).toThrow(/type/);
    expect(() => registerModuleModeration(defineModuleModeration('probe', [adapter({ permission: {} })]))).toThrow(/permission/);
  });
});

describe('empreinte de signaleur', () => {
  it('est stable, distingue identités et secrets, et ne contient ni IP ni identifiant', () => {
    const a = reporterKey({ ip: '203.0.113.9' }, 's1');
    expect(a).toBe(reporterKey({ ip: '203.0.113.9' }, 's1'));
    expect(a).not.toBe(reporterKey({ ip: '203.0.113.10' }, 's1'));
    expect(a).not.toBe(reporterKey({ ip: '203.0.113.9' }, 's2'));
    expect(reporterKey({ userId: 'u-1' }, 's1')).not.toBe(reporterKey({ ip: 'u-1' }, 's1'));
    expect(a).toMatch(/^h:[A-Za-z0-9_-]{43}$/);
    expect(a).not.toContain('203');
    expect(reporterKey({ ip: null }, 's1').length).toBeLessThanOrEqual(96);
  });
});

describe('nettoyage des textes', () => {
  it('retire le HTML, compacte les espaces, tronque et rend null si vide', () => {
    expect(cleanModerationText('  <b>Bonjour</b>\n\n<script>alert(1)</script> monde ', 100)).not.toMatch(/[<>]/);
    expect(cleanModerationText('abcdef', 3)).toBe('abc');
    expect(cleanModerationText('<p> </p>', 10)).toBeNull();
    expect(cleanModerationText(null, 10)).toBeNull();
  });
});

describe.each([['blog', blogEngagementTransition], ['services', serviceEngagementTransition]])('transitions %s', (_, transition) => {
  it('masque, marque comme spam et rétablit sans transition inutile', () => {
    expect(transition('APPROVED', 'hide')).toBe('REJECTED');
    expect(transition('PENDING', 'spam')).toBe('SPAM');
    expect(transition('REJECTED', 'hide')).toBeNull();
    expect(transition('SPAM', 'spam')).toBeNull();
    expect(transition('REJECTED', 'restore')).toBe('APPROVED');
    expect(transition('SPAM', 'restore')).toBe('APPROVED');
    expect(transition('APPROVED', 'restore')).toBeNull();
    expect(transition('PENDING', 'restore')).toBeNull();
  });
});
