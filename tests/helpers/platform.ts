/** Helpers de tests plateforme : site isolé par fichier de test. */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDrizzle, schema } from '@database/drizzle';
import { createSite, clearSiteCache } from '@/modules/sites/domain/sites';
import { createContentType, type ContentTypeInput } from '@/modules/content/domain/content-types';

export async function createTestSite(label: string) {
  const site = await createSite({ slug: `t-${label}-${randomUUID().slice(0, 6)}`, name: `Test ${label}`, domains: [], locales: ['fr', 'en'] });
  return site;
}

export async function removeTestSite(id: string) {
  await getDrizzle().delete(schema.sites).where(eq(schema.sites.id, id));
  clearSiteCache();
}

export const articleType: ContentTypeInput = {
  slug: 'article',
  name: 'Article',
  fields: [
    { name: 'summary', label: 'Résumé', type: 'textarea', required: true },
    { name: 'rating', label: 'Note', type: 'number', min: 0, max: 5, localized: false },
    { name: 'category', label: 'Catégorie', type: 'select', localized: false, options: [{ value: 'news', label: 'News' }, { value: 'guide', label: 'Guide' }] },
  ],
  settings: { hasBlocks: true, publicRead: true, singleton: false },
};

export async function createArticleType(siteId: string, overrides: Partial<ContentTypeInput> = {}) {
  return createContentType(siteId, { ...articleType, ...overrides });
}

export const sampleBlocks = { version: 1, blocks: [
  { id: 'h1', type: 'heading', data: { level: 2, text: 'Intro' } },
  { id: 'r1', type: 'richText', data: { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bonjour le monde' }] }] } } },
] };
