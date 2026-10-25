/** Module events — lectures publiques localisées, portée tenant explicite, contraintes SQL (base réelle). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { events, eventTranslations } from '@database/schemas';
import { loadPublishedEventBySlug, loadPublishedEvents } from '@/modules/events/loaders';
import { eventsModule } from '@/modules/events/module';

const tag = `evt-${Date.now()}`;
const ids: string[] = [];

beforeAll(async () => {
  const db = getDrizzle();
  const rows = await db.insert(events).values([
    { slug: `${tag}-pub`, title: 'Pub', status: 'PUBLISHED', startsAt: new Date('2030-01-02T10:00:00Z'), endsAt: new Date('2030-01-02T12:00:00Z'), publishedAt: new Date() },
    { slug: `${tag}-draft`, title: 'Draft', status: 'DRAFT' },
  ]).returning({ id: events.id });
  ids.push(...rows.map((r) => r.id));
  await db.insert(eventTranslations).values([
    { eventId: ids[0], locale: 'fr', title: 'Conférence', slug: `${tag}-conference`, content: 'Contenu', venueName: 'Salle A' },
    { eventId: ids[0], locale: 'en', title: 'Conference', slug: `${tag}-conference-en`, content: 'Body' },
    { eventId: ids[1], locale: 'fr', title: 'Brouillon', slug: `${tag}-brouillon`, content: '' },
  ]);
});

afterAll(async () => {
  if (ids.length) await getDrizzle().delete(events).where(inArray(events.id, ids));
});

describe('module events', () => {
  it('déclare ses capacités avec fournisseurs', () => {
    expect(eventsModule.capabilities.localization).toBe(true);
    expect(eventsModule.capabilities.media).toBe(true);
  });

  it('lit un événement publié par slug localisé, sans repli de locale', async () => {
    const fr = await loadPublishedEventBySlug('fr', `${tag}-conference`);
    expect(fr?.title).toBe('Conférence');
    expect(fr?.venueName).toBe('Salle A');
    expect(await loadPublishedEventBySlug('en', `${tag}-conference`)).toBeNull();
    expect(await loadPublishedEventBySlug('es', `${tag}-conference-en`)).toBeNull();
  });

  it('masque les brouillons et ne remonte pas le global dans une organisation', async () => {
    expect(await loadPublishedEventBySlug('fr', `${tag}-brouillon`)).toBeNull();
    const list = await loadPublishedEvents('fr');
    expect(list.map((e) => e.slug)).toContain(`${tag}-conference`);
    expect(list.map((e) => e.slug)).not.toContain(`${tag}-brouillon`);
    expect(await loadPublishedEventBySlug('fr', `${tag}-conference`, 'org-inexistante')).toBeNull();
  });

  it('refuse des dates inversées et une capacité nulle', async () => {
    const db = getDrizzle();
    await expect(db.insert(events).values({ slug: `${tag}-bad`, title: 'x', startsAt: new Date('2030-01-02'), endsAt: new Date('2030-01-01') })).rejects.toThrow();
    await expect(db.insert(events).values({ slug: `${tag}-bad2`, title: 'x', capacity: 0 })).rejects.toThrow();
  });
});
