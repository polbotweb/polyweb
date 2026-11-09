import { describe, it, expect } from 'vitest';
import {
  autoSanctionDecision, canViewForum, canViewTopic, clampPage, DEFAULT_SANCTION_POLICY, forumContentTransition, pollClosed, pollResultsVisible,
  reputationOf, sanctionBlocks, sanctionEnd, slugifyForum, validBallot, validSanctionPolicy,
} from '@/modules/forums/domain/rules';
import { forumBadges } from '@/modules/forums/domain/badges';
import { categoryLabel, DEFAULT_FORUM_CATEGORIES } from '@/modules/forums/domain/defaults';
import { defineBadges } from '@/core/badges';

const base = { status: 'PUBLISHED', visibility: 'public' as const, organizationId: null, signedIn: false, orgMember: false, manager: false };

describe('forums — visibilité', () => {
  it('forum : public / membres connectés / organisation ; brouillon réservé aux gestionnaires', () => {
    expect(canViewForum(base)).toBe(true);
    expect(canViewForum({ ...base, visibility: 'members' })).toBe(false);
    expect(canViewForum({ ...base, visibility: 'members', signedIn: true })).toBe(true);
    expect(canViewForum({ ...base, visibility: 'org', organizationId: 'o', signedIn: true })).toBe(false);
    expect(canViewForum({ ...base, visibility: 'org', organizationId: 'o', signedIn: true, orgMember: true })).toBe(true);
    expect(canViewForum({ ...base, status: 'DRAFT', signedIn: true })).toBe(false);
    expect(canViewForum({ ...base, status: 'ARCHIVED', manager: true })).toBe(true);
  });

  it('sujet : privé = participants seulement (même modérateur) ; masqué = modérateurs', () => {
    const t = { forumVisible: true, status: 'visible' as const, isPrivate: false, participant: false, manager: false };
    expect(canViewTopic(t)).toBe(true);
    expect(canViewTopic({ ...t, forumVisible: false })).toBe(false);
    expect(canViewTopic({ ...t, status: 'hidden' })).toBe(false);
    expect(canViewTopic({ ...t, status: 'spam', manager: true })).toBe(true);
    expect(canViewTopic({ ...t, isPrivate: true, manager: true })).toBe(false);
    expect(canViewTopic({ ...t, isPrivate: true, participant: true })).toBe(true);
    expect(canViewTopic({ ...t, isPrivate: true, participant: true, status: 'hidden' })).toBe(false);
  });

  it('transitions de modération idempotentes', () => {
    expect(forumContentTransition('visible', 'hide')).toBe('hidden');
    expect(forumContentTransition('hidden', 'hide')).toBeNull();
    expect(forumContentTransition('visible', 'spam')).toBe('spam');
    expect(forumContentTransition('spam', 'spam')).toBeNull();
    expect(forumContentTransition('spam', 'restore')).toBe('visible');
    expect(forumContentTransition('visible', 'restore')).toBeNull();
  });
});

describe('forums — sondages', () => {
  it('visibilité des résultats et clôture', () => {
    expect(pollResultsVisible({ mode: 'always', voted: false, closed: false })).toBe(true);
    expect(pollResultsVisible({ mode: 'after_vote', voted: false, closed: false })).toBe(false);
    expect(pollResultsVisible({ mode: 'after_vote', voted: true, closed: false })).toBe(true);
    expect(pollResultsVisible({ mode: 'after_close', voted: true, closed: false })).toBe(false);
    expect(pollResultsVisible({ mode: 'after_close', voted: false, closed: true })).toBe(true);
    const now = new Date('2026-01-01T00:00:00Z');
    expect(pollClosed(null, now)).toBe(false);
    expect(pollClosed(new Date('2025-12-31T23:59:59Z'), now)).toBe(true);
    expect(pollClosed(new Date('2026-01-02T00:00:00Z'), now)).toBe(false);
  });

  it('bulletin : options connues, sans doublon, une seule en choix simple', () => {
    const pollOptionIds = ['a', 'b', 'c'];
    expect(validBallot({ multiple: false, optionIds: ['a'], pollOptionIds })).toBe(true);
    expect(validBallot({ multiple: false, optionIds: ['a', 'b'], pollOptionIds })).toBe(false);
    expect(validBallot({ multiple: true, optionIds: ['a', 'b'], pollOptionIds })).toBe(true);
    expect(validBallot({ multiple: true, optionIds: ['a', 'a'], pollOptionIds })).toBe(false);
    expect(validBallot({ multiple: true, optionIds: [], pollOptionIds })).toBe(false);
    expect(validBallot({ multiple: false, optionIds: ['z'], pollOptionIds })).toBe(false);
  });
});

describe('forums — réputation et badges', () => {
  it('réputation : +10 / −2 / +15, jamais négative', () => {
    expect(reputationOf({ upvotes: 3, downvotes: 1, accepted: 2 })).toBe(58);
    expect(reputationOf({ upvotes: 0, downvotes: 10, accepted: 0 })).toBe(0);
  });

  it('registre de badges typé : règles pures, identifiants validés et uniques', () => {
    const none = { topics: 0, posts: 0, acceptedAnswers: 0, upvotesReceived: 0, reputation: 0 };
    expect(forumBadges.earned(none)).toEqual([]);
    expect(forumBadges.earned({ ...none, topics: 1, posts: 1, acceptedAnswers: 1 })).toEqual(['first_topic', 'first_reply', 'helpful']);
    expect(forumBadges.earned({ topics: 30, posts: 30, acceptedAnswers: 10, upvotesReceived: 60, reputation: 750 })).toHaveLength(7);
    expect(() => defineBadges('m', [{ id: 'Bad Id', tier: 'bronze', rule: () => true }])).toThrow(/Invalid badge id/);
    expect(() => defineBadges('m', [{ id: 'dup', tier: 'bronze', rule: () => true }, { id: 'dup', tier: 'gold', rule: () => true }])).toThrow(/Duplicate badge/);
  });
});

describe('forums — sanctions automatiques', () => {
  const policy = DEFAULT_SANCTION_POLICY;
  it('seuils, escalade, pas de cumul', () => {
    expect(autoSanctionDecision({ policy, upheld: 2, activeKinds: [], priorMuteInWindow: false })).toBeNull();
    expect(autoSanctionDecision({ policy, upheld: 3, activeKinds: [], priorMuteInWindow: false })).toBe('mute');
    expect(autoSanctionDecision({ policy, upheld: 3, activeKinds: ['mute'], priorMuteInWindow: false })).toBeNull();
    expect(autoSanctionDecision({ policy, upheld: 4, activeKinds: [], priorMuteInWindow: true })).toBe('suspension');
    expect(autoSanctionDecision({ policy, upheld: 5, activeKinds: [], priorMuteInWindow: false })).toBe('suspension');
    expect(autoSanctionDecision({ policy, upheld: 9, activeKinds: ['suspension'], priorMuteInWindow: true })).toBeNull();
    expect(autoSanctionDecision({ policy: { ...policy, enabled: false }, upheld: 9, activeKinds: [], priorMuteInWindow: false })).toBeNull();
  });

  it('échéances, blocages et bornes de la politique', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(sanctionEnd('mute', policy, now).toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(sanctionEnd('suspension', policy, now).toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(sanctionBlocks(['mute'], 'post')).toBe(true);
    expect(sanctionBlocks(['mute'], 'interact')).toBe(false);
    expect(sanctionBlocks(['suspension'], 'interact')).toBe(true);
    expect(sanctionBlocks([], 'post')).toBe(false);
    expect(validSanctionPolicy(policy)).toBe(true);
    expect(validSanctionPolicy({ ...policy, suspendThreshold: 3 })).toBe(false);
    expect(validSanctionPolicy({ ...policy, windowDays: 0 })).toBe(false);
    expect(validSanctionPolicy({ ...policy, muteHours: 1.5 })).toBe(false);
  });
});

describe('forums — utilitaires et catégories par défaut', () => {
  it('slug et pagination bornée', () => {
    expect(slugifyForum('  Questions & Entraide — été ')).toBe('questions-entraide-ete');
    expect(clampPage('0')).toBe(1);
    expect(clampPage('abc')).toBe(1);
    expect(clampPage('5')).toBe(5);
    expect(clampPage('999999')).toBe(1000);
  });

  it('catégories pré-remplies traduites dans les 4 langues', () => {
    expect(DEFAULT_FORUM_CATEGORIES.length).toBeGreaterThanOrEqual(4);
    for (const c of DEFAULT_FORUM_CATEGORIES) for (const l of ['fr', 'en', 'es', 'ar']) expect(c.translations[l]?.name, `${c.slug}.${l}`).toBeTruthy();
    expect(categoryLabel({ fr: { name: 'Nom', description: '' } }, 'es', 's').name).toBe('Nom');
    expect(categoryLabel({}, 'fr', 'slug').name).toBe('slug');
  });
});
