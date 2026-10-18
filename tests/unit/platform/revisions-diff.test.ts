import { describe, it, expect } from 'vitest';
import { diffSnapshots } from '@/modules/content/domain/revisions';
import { validateEntryInput, slugify, pickTranslation } from '@/modules/content/domain/entries';
import type { EntrySnapshot } from '@database/schemas/content.schema';

const base: EntrySnapshot = { slug: 'a', status: 'draft', sharedData: { n: 1 }, translations: [{ locale: 'fr', title: 'Le chat dort', data: {}, blocks: null, seo: {} }] };

describe('diffSnapshots', () => {
  it('détecte ajout, suppression et modification mot à mot', () => {
    const next: EntrySnapshot = { ...base, status: 'published', sharedData: {}, translations: [{ locale: 'fr', title: 'Le chien dort', data: { x: 'y' }, blocks: null, seo: {} }] };
    const d = diffSnapshots(base, next);
    expect(d.find((x) => x.path === 'status')!.kind).toBe('changed');
    expect(d.find((x) => x.path === 'shared.n')!.kind).toBe('removed');
    expect(d.find((x) => x.path === 'fr.x')!.kind).toBe('added');
    const t = d.find((x) => x.path === 'fr.title')!;
    expect(t.parts.filter((p) => p.removed).map((p) => p.value.trim())).toEqual(['chat']);
    expect(t.parts.filter((p) => p.added).map((p) => p.value.trim())).toEqual(['chien']);
    expect(diffSnapshots(base, base)).toEqual([]);
  });
});

describe('entries helpers', () => {
  it('slugify', () => {
    expect(slugify('Élégant Été — 2026 !')).toBe('elegant-ete-2026');
    expect(slugify('***')).toBe('entree');
  });
  it('validateEntryInput ignore les blocs si le type ne les active pas', () => {
    const r = validateEntryInput({ fields: [], settings: { hasBlocks: false } }, { translations: { fr: { title: 'x', blocks: { version: 1, blocks: [{ id: 'a', type: 'nope', data: {} }] } } } }, ['fr']);
    expect(r.translations[0]!.blocks).toBeNull();
  });
  it('pickTranslation avec repli', () => {
    const e = { translations: [{ locale: 'en', title: 'EN' }, { locale: 'fr', title: 'FR' }] } as never;
    expect(pickTranslation(e, 'es', 'fr')!.title).toBe('FR');
    expect(pickTranslation(e, 'en')!.title).toBe('EN');
  });
});
