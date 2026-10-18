import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { onEvent, type PolywebEvent } from '@/core/events';
import { createContentType, updateContentType, getContentType, listContentTypes, ContentTypeConflictError } from '@/modules/content/domain/content-types';
import { createEntry, updateEntry, setEntryStatus, deleteEntry, getEntry, listEntries, getPublishedEntryBySlug, EntryValidationError, EntryConflictError } from '@/modules/content/domain/entries';
import { listRevisions, diffSnapshots, restoreRevision, getRevision } from '@/modules/content/domain/revisions';
import { createTestSite, removeTestSite, createArticleType, sampleBlocks } from '../../helpers/platform';
import type { Site } from '@/modules/sites/domain/sites';
import type { ContentType } from '@/modules/content/domain/content-types';

let site: Site;
let type: ContentType;
const events: PolywebEvent[] = [];
let off: () => void;
const opts = () => ({ authorId: null, allowedLocales: ['fr', 'en'] });

beforeAll(async () => {
  site = await createTestSite('content');
  type = await createArticleType(site.id);
  off = onEvent('*', (e) => { if (e.siteId === site.id) events.push(e); });
});
afterAll(async () => { off(); await removeTestSite(site.id); });
afterEach(() => { events.length = 0; });

describe('types de contenu', () => {
  it('crée, liste, met à jour, refuse les doublons', async () => {
    expect((await listContentTypes(site.id)).map((t) => t.slug)).toContain('article');
    await expect(createArticleType(site.id)).rejects.toBeInstanceOf(ContentTypeConflictError);
    const other = await createContentType(site.id, { slug: 'event', name: 'Évènement', fields: '[{"name":"date","label":"Date","type":"date","required":true,"localized":false}]' });
    const updated = await updateContentType(site.id, other.id, { slug: 'event', name: 'Évènements', fields: [], settings: { hasBlocks: false } });
    expect(updated.name).toBe('Évènements');
    expect((await getContentType(site.id, 'event'))?.settings.hasBlocks).toBe(false);
    await expect(createContentType(site.id, { slug: 'bad', name: 'x', fields: [{ name: 'slug', label: 'x', type: 'text' }] })).rejects.toThrow(/réservé/);
  });
});

describe('entrées', () => {
  it('valide les données selon la définition du type', async () => {
    const err = await createEntry(type, { translations: { fr: { title: '', data: { summary: '' } } }, sharedData: { rating: 9, category: 'nope' } }, opts()).catch((e) => e);
    expect(err).toBeInstanceOf(EntryValidationError);
    expect(Object.keys(err.errors).sort()).toEqual(['fr.summary', 'fr.title', 'shared.category', 'shared.rating']);
    await expect(createEntry(type, { translations: { de: { title: 'x', data: { summary: 'y' } } } }, opts())).rejects.toThrow(/locale/);
    await expect(createEntry(type, { translations: { fr: { title: 'x', data: { summary: 'y' }, blocks: { version: 1, blocks: [{ id: 'a', type: 'evil', data: {} }] } } } }, opts())).rejects.toThrow(/inconnu/);
  });

  it('cycle de vie complet : création → maj → publication → révisions → diff → restauration → suppression', async () => {
    const created = await createEntry(type, {
      translations: { fr: { title: 'Premier Article', data: { summary: 'Résumé FR' }, blocks: sampleBlocks }, en: { title: 'First article', data: { summary: 'EN summary' } } },
      sharedData: { rating: '4', category: 'news' },
    }, opts());
    expect(created.slug).toBe('premier-article');
    expect(created.status).toBe('draft');
    expect(events.map((e) => e.name)).toEqual(['content.created']);

    const full = await getEntry(type, created.id);
    expect(full!.sharedData).toEqual({ rating: 4, category: 'news' });
    expect(full!.translations.map((t) => t.locale).sort()).toEqual(['en', 'fr']);
    expect(full!.translations.find((t) => t.locale === 'fr')!.blocks!.blocks).toHaveLength(2);

    expect(await getPublishedEntryBySlug(type, 'premier-article')).toBeUndefined();
    await setEntryStatus(type, created.id, 'published', null);
    const pub = await getPublishedEntryBySlug(type, 'premier-article');
    expect(pub?.publishedAt).toBeInstanceOf(Date);

    // Conflit d'édition optimiste
    await expect(updateEntry(type, created.id, { translations: { fr: { title: 'X', data: { summary: 'Y' } } } }, { ...opts(), expectedVersion: 1 })).rejects.toBeInstanceOf(EntryConflictError);
    const v3 = await updateEntry(type, created.id, { translations: { fr: { title: 'Premier article modifié', data: { summary: 'Résumé corrigé' } } } }, { ...opts(), expectedVersion: 2 });
    expect(v3.version).toBe(3);
    expect(events.map((e) => e.name)).toEqual(['content.created', 'content.published', 'content.updated']);

    const revs = await listRevisions(created.id);
    expect(revs.map((r) => r.version)).toEqual([3, 2, 1]);
    const diff = diffSnapshots((await getRevision(created.id, 1))!.snapshot, (await getRevision(created.id, 3))!.snapshot);
    const paths = diff.map((d) => d.path);
    expect(paths).toContain('fr.title');
    expect(paths).toContain('status');
    const title = diff.find((d) => d.path === 'fr.title')!;
    expect(title.parts.some((p) => p.added && p.value.includes('modifié'))).toBe(true);

    const restored = await restoreRevision(type, created.id, 1, opts());
    const after = await getEntry(type, created.id);
    expect(after!.translations.find((t) => t.locale === 'fr')!.title).toBe('Premier Article');
    expect(restored.status).toBe('draft'); // l'instantané v1 était un brouillon
    expect(events.map((e) => e.name)).toContain('content.unpublished');

    await deleteEntry(type, created.id);
    expect(await getEntry(type, created.id)).toBeUndefined();
    expect(events.at(-1)!.name).toBe('content.deleted');
  });

  it('slug unique par type, liste paginée et recherche', async () => {
    await createEntry(type, { slug: 'dup', translations: { fr: { title: 'A', data: { summary: 's' } } } }, opts());
    await expect(createEntry(type, { slug: 'dup', translations: { fr: { title: 'B', data: { summary: 's' } } } }, opts())).rejects.toBeInstanceOf(EntryConflictError);
    for (let i = 0; i < 3; i++) await createEntry(type, { translations: { fr: { title: `Recherche ${i}`, data: { summary: 's' } } } }, opts());
    const { items, total } = await listEntries(type, { search: 'recherche', limit: 2 });
    expect(total).toBe(3);
    expect(items).toHaveLength(2);
    expect((await listEntries(type, { search: '100%_' })).total).toBe(0);
  });

  it('type singleton : une seule entrée', async () => {
    const home = await createContentType(site.id, { slug: 'home', name: 'Accueil', fields: [], settings: { singleton: true } });
    await createEntry(home, { translations: { fr: { title: 'Accueil' } } }, opts());
    await expect(createEntry(home, { translations: { fr: { title: 'Encore' } } }, opts())).rejects.toThrow(/singleton/);
  });
});
