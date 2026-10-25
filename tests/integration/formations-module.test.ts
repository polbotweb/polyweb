/** Module formations — lectures publiques localisées, portée tenant explicite, contraintes SQL (base réelle). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { formations, formationTranslations } from '@database/schemas';
import { loadPublishedFormationBySlug, loadPublishedFormations } from '@/modules/formations/loaders';
import { formationsModule } from '@/modules/formations/module';

const tag = `frm-${Date.now()}`;
const ids: string[] = [];

beforeAll(async () => {
  const db = getDrizzle();
  const rows = await db.insert(formations).values([
    { slug: `${tag}-pub`, title: 'Pub', status: 'PUBLISHED', level: 'BEGINNER', durationHours: 21, certificate: true, publishedAt: new Date() },
    { slug: `${tag}-draft`, title: 'Draft', status: 'DRAFT' },
  ]).returning({ id: formations.id });
  ids.push(...rows.map((r) => r.id));
  await db.insert(formationTranslations).values([
    { formationId: ids[0], locale: 'fr', title: 'Parcours web', slug: `${tag}-web`, content: 'Contenu', objectives: 'Savoir coder' },
    { formationId: ids[0], locale: 'en', title: 'Web track', slug: `${tag}-web-en`, content: 'Body' },
    { formationId: ids[1], locale: 'fr', title: 'Brouillon', slug: `${tag}-brouillon`, content: '' },
  ]);
});

afterAll(async () => {
  if (ids.length) await getDrizzle().delete(formations).where(inArray(formations.id, ids));
});

describe('module formations', () => {
  it('déclare ses capacités avec fournisseurs', () => {
    expect(formationsModule.capabilities.localization).toBe(true);
    expect(formationsModule.capabilities.media).toBe(true);
  });

  it('lit une formation publiée par slug localisé, sans repli de locale', async () => {
    const fr = await loadPublishedFormationBySlug('fr', `${tag}-web`);
    expect(fr?.title).toBe('Parcours web');
    expect(fr?.level).toBe('BEGINNER');
    expect(fr?.certificate).toBe(true);
    expect(fr?.objectives).toBe('Savoir coder');
    expect(await loadPublishedFormationBySlug('en', `${tag}-web`)).toBeNull();
    expect(await loadPublishedFormationBySlug('es', `${tag}-web-en`)).toBeNull();
  });

  it('masque les brouillons et ne remonte pas le global dans une organisation', async () => {
    expect(await loadPublishedFormationBySlug('fr', `${tag}-brouillon`)).toBeNull();
    const slugs = (await loadPublishedFormations('fr')).map((f) => f.slug);
    expect(slugs).toContain(`${tag}-web`);
    expect(slugs).not.toContain(`${tag}-brouillon`);
    expect(await loadPublishedFormationBySlug('fr', `${tag}-web`, 'org-inexistante')).toBeNull();
  });

  it('refuse une durée nulle et un prix négatif', async () => {
    const db = getDrizzle();
    await expect(db.insert(formations).values({ slug: `${tag}-bad`, title: 'x', durationHours: 0 })).rejects.toThrow();
    await expect(db.insert(formations).values({ slug: `${tag}-bad2`, title: 'x', priceMinor: -1 })).rejects.toThrow();
  });
});
