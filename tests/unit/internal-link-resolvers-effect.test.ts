import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Effect } from 'effect';

const { getBlogPostBySlug, getBlogValidLinkTargets, getServiceBySlug } = vi.hoisted(() => ({
  getBlogPostBySlug: vi.fn(),
  getBlogValidLinkTargets: vi.fn(),
  getServiceBySlug: vi.fn(),
}));

vi.mock('@database/loaders/blog.loader', () => ({
  getBlogPostBySlug,
  getBlogValidLinkTargets,
  orgScope: vi.fn(),
  publishedScope: vi.fn(),
}));
vi.mock('@/modules/services/loaders', () => ({ getServiceBySlug }));
vi.mock('@database/drizzle', () => ({ getDrizzle: vi.fn() }));

import { blogInternalLinkEffects, blogInternalLinkResolver } from '@/lib/blog/blog-internal-link';
import { serviceInternalLinkEffects, serviceInternalLinkResolver } from '@/lib/services/services-internal-link';

beforeEach(() => vi.clearAllMocks());

describe('résolveurs de liens internes (Effect + adaptateur Promise)', () => {
  it('blog.resolve : article absent → exists:false', async () => {
    getBlogPostBySlug.mockResolvedValue(null);
    expect(await blogInternalLinkResolver.resolve('x', { locale: 'fr' })).toEqual({ href: '#', title: null, exists: false });
  });

  it('blog.resolve : article trouvé → href + titre', async () => {
    getBlogPostBySlug.mockResolvedValue({ translation: { slug: 'mon-article', title: 'Mon article' }, categories: [] });
    const r = await blogInternalLinkResolver.resolve('mon-article', { locale: 'fr', organizationId: null });
    expect(r.exists).toBe(true);
    expect(r.title).toBe('Mon article');
    expect(r.href).toContain('mon-article');
  });

  it('blog : échec DB → DbError typé côté Effect, cause d’origine côté Promise', async () => {
    const boom = new Error('db down');
    getBlogValidLinkTargets.mockRejectedValue(boom);
    const r = await Effect.runPromise(Effect.result(blogInternalLinkEffects.listValidTargets({ locale: 'fr' })));
    expect(r._tag).toBe('Failure');
    if (r._tag === 'Failure') {
      expect(r.failure._tag).toBe('DbError');
      expect(r.failure.operation).toBe('blog-link.listValidTargets');
    }
    await expect(blogInternalLinkResolver.listValidTargets({ locale: 'fr' })).rejects.toBe(boom);
  });

  it('services.resolve : service absent → exists:false ; échec → cause d’origine', async () => {
    getServiceBySlug.mockResolvedValueOnce(null);
    expect(await serviceInternalLinkResolver.resolve('x', { locale: 'fr' })).toEqual({ href: '#', title: null, exists: false });
    const boom = new Error('db down');
    getServiceBySlug.mockRejectedValueOnce(boom);
    await expect(serviceInternalLinkResolver.resolve('x', { locale: 'fr' })).rejects.toBe(boom);
    getServiceBySlug.mockRejectedValueOnce(boom);
    const r = await Effect.runPromise(Effect.result(serviceInternalLinkEffects.resolve('x', { locale: 'fr' })));
    expect(r._tag === 'Failure' && r.failure._tag).toBe('DbError');
  });
});
