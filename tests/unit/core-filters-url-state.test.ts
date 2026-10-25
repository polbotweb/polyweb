import { describe, expect, it } from 'vitest';
import { activeFilterCount, canonicalListQuery, clearFilter, parseListUrlState, serializeListUrlState, toggleFacetValue } from '@/core/filters';
import type { AdminResourceListDefinition } from '@/core/admin/filter-contract';
import { serviceAdminResource } from '@/modules/services/admin/resource';

const def: AdminResourceListDefinition = {
  filters: [
    { id: 'search', kind: 'search', queryParam: 'q' },
    { id: 'status', kind: 'select', queryParam: 'status', options: ['DRAFT', 'PUBLISHED'] },
    { id: 'tags', kind: 'multi-select', queryParam: 'tag', facet: true },
    { id: 'featured', kind: 'boolean', queryParam: 'featured' },
    { id: 'published', kind: 'date', queryParam: 'published' },
    { id: 'price', kind: 'number-range', queryParam: 'price', min: 0, max: 1000 },
  ],
  sorts: [
    { id: 'updatedAt', queryParam: 'sortBy', directions: ['asc', 'desc'] },
    { id: 'title', queryParam: 'sortBy', directions: ['asc'] },
  ],
  defaultSort: 'updatedAt',
};

describe('core/filters — état d’URL', () => {
  it('parse tous les types de filtres', () => {
    const s = parseListUrlState(def, 'q=yoga&status=DRAFT&tag=b&tag=a,b&featured=true&publishedFrom=2026-01-31&publishedTo=2026-01-01&priceMin=50&priceMax=20&sortBy=title&sortOrder=asc&page=3');
    expect(s.filters).toEqual({ search: 'yoga', status: 'DRAFT', tags: ['a', 'b'], featured: true, published: { from: '2026-01-01', to: '2026-01-31' }, price: { min: 20, max: 50 } });
    expect(s.sort).toEqual({ id: 'title', direction: 'asc' });
    expect(s.page).toBe(3);
  });

  it('ignore les valeurs invalides, inconnues ou hors bornes (jamais transmises)', () => {
    const s = parseListUrlState(def, `status=EVIL&featured=yes&publishedFrom=2026-02-30&priceMin=abc&priceMax=99999&sortBy=password&sortOrder=sideways&page=-4&q=${'x'.repeat(500)}&unknown=1`);
    expect(s.filters).toEqual({ price: { max: 1000 } });
    expect(s.sort).toEqual({ id: 'updatedAt', direction: 'desc' });
    expect(s.page).toBe(1);
  });

  it('direction non permise pour le tri → direction par défaut du tri', () => {
    expect(parseListUrlState(def, 'sortBy=title&sortOrder=desc').sort).toEqual({ id: 'title', direction: 'asc' });
  });

  it('sérialisation canonique : défauts omis, ordre stable, aller-retour idempotent', () => {
    const q = canonicalListQuery(def, 'page=1&sortBy=updatedAt&sortOrder=desc&tag=z&tag=a&q=%20yoga%20');
    expect(q).toBe('q=yoga&tag=a&tag=z');
    expect(canonicalListQuery(def, q)).toBe(q);
    const full = 'q=yoga&status=PUBLISHED&tag=a&featured=false&publishedFrom=2026-01-01&priceMin=0&priceMax=10&sortBy=title&sortOrder=asc&page=2';
    expect(canonicalListQuery(def, full)).toBe(full);
  });

  it('facettes : bascule, effacement, compteur ; retour page 1', () => {
    let s = parseListUrlState(def, 'tag=a&page=4');
    s = toggleFacetValue(s, 'tags', 'b');
    expect(s.filters.tags).toEqual(['a', 'b']);
    expect(s.page).toBe(1);
    s = toggleFacetValue(toggleFacetValue(s, 'tags', 'a'), 'tags', 'b');
    expect(s.filters.tags).toBeUndefined();
    s = parseListUrlState(def, 'q=x&featured=true');
    expect(activeFilterCount(s)).toBe(2);
    expect(activeFilterCount(clearFilter(s, 'search'))).toBe(1);
    expect(activeFilterCount(clearFilter(s))).toBe(0);
    expect(serializeListUrlState(def, clearFilter(s)).toString()).toBe('');
  });

  it('fonctionne avec une vraie ressource de module (services)', () => {
    const s = parseListUrlState(serviceAdminResource.list!, 'search=massage&featured=true&sortBy=priceMinor&sortOrder=asc');
    expect(s.filters).toEqual({ search: 'massage', featured: true });
    expect(s.sort).toEqual({ id: 'priceMinor', direction: 'asc' });
  });
});
