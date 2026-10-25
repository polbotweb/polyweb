import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { computeFacets, facetLinks, FacetError } from '@/core/filters';
import type { AdminResourceListDefinition } from '@/core/admin/filter-contract';

const def: AdminResourceListDefinition = {
  filters: [
    { id: 'status', kind: 'select', queryParam: 'status', options: ['DRAFT', 'PUBLISHED'] },
    { id: 'tags', kind: 'multi-select', queryParam: 'tag' },
    { id: 'featured', kind: 'boolean', queryParam: 'featured' },
  ],
};

describe('computeFacets', () => {
  it('compte chaque facette sans son propre filtre, avec les autres', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const result = await Effect.runPromise(computeFacets({ status: 'DRAFT', featured: true } as { status?: string; featured?: boolean }, [
      { id: 'status', filterKey: 'status', count: async (f) => { seen.push(f); return [{ value: 'DRAFT', count: 1 }, { value: 'PUBLISHED', count: 5 }]; } },
      { id: 'featured', filterKey: 'featured', count: async (f) => { seen.push(f); return [{ value: 'true', count: 2 }]; } },
    ]));
    expect(seen).toContainEqual({ status: undefined, featured: true });
    expect(seen).toContainEqual({ status: 'DRAFT', featured: undefined });
    expect(result.status!.map((b) => b.value)).toEqual(['PUBLISHED', 'DRAFT']);
  });

  it('erreur de comptage typée (FacetError)', async () => {
    const exit = await Effect.runPromiseExit(computeFacets({}, [{ id: 'x', filterKey: 'x' as never, count: async () => { throw new Error('db'); } }]));
    expect(exit._tag).toBe('Failure');
    expect(JSON.stringify(exit)).toContain('FacetError');
    expect(new FacetError({ facet: 'x', cause: null })._tag).toBe('FacetError');
  });
});

describe('facetLinks', () => {
  it('select : choisir / désélectionner, page remise à 1, URL canonique', () => {
    const links = facetLinks(def, 'status=DRAFT&page=3', 'status', [{ value: 'DRAFT', count: 2 }, { value: 'PUBLISHED', count: 4 }], '/fr/admin/x');
    expect(links.find((l) => l.value === 'DRAFT')).toMatchObject({ active: true, href: '/fr/admin/x' });
    expect(links.find((l) => l.value === 'PUBLISHED')).toMatchObject({ active: false, href: '/fr/admin/x?status=PUBLISHED' });
  });
  it('multi-select : bascule et conserve les autres valeurs ; valeur active sans résultat gardée à 0', () => {
    const links = facetLinks(def, 'tag=a&tag=z', 'tags', [{ value: 'a', count: 3 }, { value: 'b', count: 1 }], '/l');
    expect(links.find((l) => l.value === 'b')!.href).toBe('/l?tag=a&tag=b&tag=z');
    expect(links.find((l) => l.value === 'a')!.href).toBe('/l?tag=z');
    expect(links.find((l) => l.value === 'z')).toMatchObject({ count: 0, active: true });
  });
  it('boolean : true/false exclusifs', () => {
    const links = facetLinks(def, 'featured=true', 'featured', [{ value: 'true', count: 1 }, { value: 'false', count: 9 }], '/l', (v) => (v === 'true' ? 'Oui' : 'Non'));
    expect(links.find((l) => l.value === 'false')).toMatchObject({ label: 'Non', href: '/l?featured=false', active: false });
    expect(links.find((l) => l.value === 'true')).toMatchObject({ active: true, href: '/l' });
  });
});
