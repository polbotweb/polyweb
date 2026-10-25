/** Contrat générique de catégories (core/taxonomy) — fonctions pures : validation, arbre, filtre d'URL, registre. */
import { describe, expect, it } from 'vitest';
import {
  buildCategoryTree,
  categoryFilterFromUrl,
  categoryTaxonomyFor,
  registerCategoryTaxonomy,
  registeredCategoryTaxonomies,
  validateCategoryInput,
  type CategoryRecord,
  type CategoryTaxonomy,
} from '@/core/taxonomy/categories';

const rec = (id: string, parentId: string | null, sortOrder = 0): CategoryRecord => ({ id, organizationId: null, parentId, slug: id, sortOrder, icon: null, color: null, name: id, localizedSlug: id, description: null });

describe('validateCategoryInput', () => {
  it('accepte une entrée valide', () => {
    expect(validateCategoryInput({ slug: 'jazz-live', color: '#A0B1C2', translations: [{ locale: 'fr', name: 'Jazz', slug: 'jazz' }] })).toBeNull();
  });
  it('refuse slug, couleur et traductions invalides', () => {
    const error = validateCategoryInput({ slug: 'Bad Slug', color: 'red', translations: [{ locale: 'fr', name: '', slug: 'ok' }] });
    expect(error?._tag).toBe('ValidationError');
    const paths = error!.issues.map((issue) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['slug', 'color']));
  });
});

describe('buildCategoryTree', () => {
  it('construit l’arbre, trie par sortOrder et remonte les orphelins à la racine', () => {
    const tree = buildCategoryTree([rec('b', null, 2), rec('a', null, 1), rec('a1', 'a'), rec('orphan', 'missing')]);
    expect(tree.map((n) => n.id)).toEqual(expect.arrayContaining(['a', 'b', 'orphan']));
    expect(tree.findIndex((n) => n.id === 'a')).toBeLessThan(tree.findIndex((n) => n.id === 'b'));
    expect(tree.find((n) => n.id === 'a')!.children.map((n) => n.id)).toEqual(['a1']);
  });
});

describe('categoryFilterFromUrl', () => {
  it('n’accepte qu’un uuid (jamais de valeur brute en SQL)', () => {
    const id = crypto.randomUUID();
    expect(categoryFilterFromUrl(id.toUpperCase())).toBe(id);
    expect(categoryFilterFromUrl("1' OR 1=1")).toBeUndefined();
    expect(categoryFilterFromUrl(['x'])).toBeUndefined();
    expect(categoryFilterFromUrl(undefined)).toBeUndefined();
  });
});

describe('registre des taxonomies', () => {
  it('un seul stockage par type de ressource, aucun repli pour un module non adhérent', () => {
    const a = { resourceType: 'unit-test-taxo' } as CategoryTaxonomy;
    expect(registerCategoryTaxonomy(a)).toBe(a);
    expect(registerCategoryTaxonomy(a)).toBe(a);
    expect(() => registerCategoryTaxonomy({ resourceType: 'unit-test-taxo' } as CategoryTaxonomy)).toThrow(/already registered/);
    expect(categoryTaxonomyFor('unit-test-taxo')).toBe(a);
    expect(categoryTaxonomyFor('not-a-module')).toBeUndefined();
    expect(registeredCategoryTaxonomies()).toContain('unit-test-taxo');
  });
});
