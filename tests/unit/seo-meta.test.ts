import { describe, it, expect } from 'vitest';
import { buildSeoExtraMeta, articleJsonLd, breadcrumbJsonLd, absoluteUrl, websiteJsonLd } from '@/lib/seo/seo-meta';

describe('seo-meta (repris de les-rochers-blancs)', () => {
  it('émet og:locale:alternate pour les autres locales', () => {
    const tags = buildSeoExtraMeta({ locale: 'fr' });
    const alts = tags.filter((t) => t.property === 'og:locale:alternate').map((t) => t.content);
    expect(alts).toEqual(expect.arrayContaining(['en_US', 'es_ES', 'ar_AR']));
    expect(alts).not.toContain('fr_FR');
  });
  it('émet les balises article:* uniquement pour ogType article', () => {
    const d = '2026-01-02T03:04:05.000Z';
    const art = buildSeoExtraMeta({ locale: 'en', ogType: 'article', publishedTime: d, author: 'Jane', tags: ['a', 'b'] });
    expect(art).toContainEqual({ property: 'article:published_time', content: d });
    expect(art.filter((t) => t.property === 'article:tag')).toHaveLength(2);
    const site = buildSeoExtraMeta({ locale: 'en', publishedTime: d });
    expect(site.some((t) => t.property?.startsWith('article:'))).toBe(false);
  });
  it('noindex → robots', () => {
    expect(buildSeoExtraMeta({ locale: 'fr', noindex: true })).toContainEqual({ name: 'robots', content: 'noindex, nofollow' });
  });
  it('JSON-LD builders', () => {
    const a = articleJsonLd({ headline: 'x'.repeat(200), url: 'https://e.test/a', locale: 'fr', datePublished: '2026-01-01' });
    expect((a.headline as string).length).toBe(110);
    expect(a.dateModified).toBe(a.datePublished);
    const b = breadcrumbJsonLd([{ name: 'A', url: '/a' }, { name: 'B', url: '/b' }]);
    expect((b.itemListElement as Array<{ position: number }>)[1]!.position).toBe(2);
    expect(websiteJsonLd({ name: 'S', url: 'https://e.test', locale: 'fr', searchUrlTemplate: 'https://e.test/s?q={search_term_string}' }).potentialAction).toBeDefined();
  });
  it('absoluteUrl', () => {
    expect(absoluteUrl('https://e.test/', '/img.png')).toBe('https://e.test/img.png');
    expect(absoluteUrl('https://e.test', 'https://cdn.test/x.png')).toBe('https://cdn.test/x.png');
  });
});
