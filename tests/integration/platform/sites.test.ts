import { describe, it, expect, afterAll } from 'vitest';
import { createSite, updateSite, deleteSite, resolveSiteForHost, pickSiteForHost, ensureDefaultSite, SiteDomainConflictError, normalizeHost, clearSiteCache } from '@/modules/sites/domain/sites';
import { removeTestSite } from '../../helpers/platform';

const created: string[] = [];
afterAll(async () => { for (const id of created) await removeTestSite(id); });

describe('multi-site', () => {
  it('normalise les hôtes', () => {
    expect(normalizeHost('WWW.Example.com:4321')).toBe('www.example.com');
    expect(normalizeHost('example.com.')).toBe('example.com');
  });
  it('résout le site par domaine, sinon le site par défaut', async () => {
    const def = await ensureDefaultSite();
    const s = await createSite({ slug: `mt-${Date.now()}`, name: 'Tenant', domains: 'tenant-a.test, www.tenant-a.test' });
    created.push(s.id);
    clearSiteCache();
    expect((await resolveSiteForHost('www.tenant-a.test:8080')).id).toBe(s.id);
    expect((await resolveSiteForHost('unknown.test')).id).toBe(def.id);
    expect(pickSiteForHost([], 'x')).toBeUndefined();
  });
  it('interdit un domaine déjà attribué et la suppression du site par défaut', async () => {
    await expect(createSite({ slug: `mt2-${Date.now()}`, name: 'B', domains: ['tenant-a.test'] })).rejects.toBeInstanceOf(SiteDomainConflictError);
    const def = await ensureDefaultSite();
    await expect(deleteSite(def.id)).rejects.toThrow(/défaut/);
    await expect(createSite({ slug: 'Bad Slug', name: 'x', domains: [] })).rejects.toThrow();
  });
  it('met à jour et supprime un site', async () => {
    const s = await createSite({ slug: `mt3-${Date.now()}`, name: 'C', domains: [] });
    const u = await updateSite(s.id, { slug: s.slug, name: 'C2', domains: ['c2.test'], defaultLocale: 'en', locales: ['fr'] });
    expect(u.locales).toEqual(['en', 'fr']);
    await deleteSite(s.id);
    clearSiteCache();
    expect((await resolveSiteForHost('c2.test')).isDefault).toBe(true);
  });
});
