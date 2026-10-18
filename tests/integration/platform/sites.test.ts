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

describe('multi-site — façade Effect (brique j)', () => {
  it('mappe les erreurs en erreurs typées', async () => {
    const { Effect, Exit } = await import('effect');
    const { appRuntime } = await import('@/lib/effect/runtime');
    const { siteCreate, siteGet, siteDelete, siteUpdate, sitesList } = await import('@/modules/sites/domain/sites.effect');
    const tagOf = (exit: import('effect').Exit.Exit<unknown, unknown>) =>
      Exit.isFailure(exit) ? (exit.cause.reasons.find((r) => r._tag === 'Fail') as { error: { _tag: string } } | undefined)?.error._tag : 'success';
    const run = <A, E>(e: import('effect').Effect.Effect<A, E, never>) => appRuntime.runPromiseExit(e);
    const slug = `fx-${Date.now()}`;
    const ok = await run(siteCreate({ slug, name: 'Fx', domains: 'fx-site.test' }));
    expect(Exit.isSuccess(ok)).toBe(true);
    const site = Exit.isSuccess(ok) ? ok.value : null;
    created.push(site!.id);
    expect(tagOf(await run(siteCreate({ slug, name: 'Dup', domains: [] })))).toBe('ConflictError');
    expect(tagOf(await run(siteCreate({ slug: `${slug}-b`, name: 'Dom', domains: ['fx-site.test'] })))).toBe('ConflictError');
    expect(tagOf(await run(siteCreate({ slug: 'Bad Slug', name: 'x', domains: [] })))).toBe('ValidationError');
    expect(tagOf(await run(siteGet('missing')))).toBe('NotFoundError');
    expect(tagOf(await run(siteUpdate('missing', { slug: 'x', name: 'x', domains: [] })))).toBe('NotFoundError');
    const def = await ensureDefaultSite();
    expect(tagOf(await run(siteDelete(def.id)))).toBe('ConflictError');
    const all = await appRuntime.runPromise(sitesList);
    expect(all.some((s) => s.slug === slug)).toBe(true);
    void Effect;
  });
});
