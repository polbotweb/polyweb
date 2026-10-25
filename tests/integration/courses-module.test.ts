/** Module courses — lectures publiques localisées, portée tenant explicite, contraintes SQL (base réelle). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { courseLessons, courseLessonTranslations, courses, courseTranslations, formationCourses, formations } from '@database/schemas';
import { loadCourseLessons, loadPublishedCourseBySlug, loadPublishedCourses, loadPublishedCoursesByFormation } from '@/modules/courses/loaders';
import { coursesModule } from '@/modules/courses/module';

const tag = `frm-${Date.now()}`;
const ids: string[] = [];
let formationId = '';

beforeAll(async () => {
  const db = getDrizzle();
  const rows = await db.insert(courses).values([
    { slug: `${tag}-pub`, title: 'Pub', status: 'PUBLISHED', level: 'BEGINNER', durationMinutes: 90, publishedAt: new Date() },
    { slug: `${tag}-draft`, title: 'Draft', status: 'DRAFT' },
  ]).returning({ id: courses.id });
  ids.push(...rows.map((r) => r.id));
  await db.insert(courseTranslations).values([
    { courseId: ids[0], locale: 'fr', title: 'Parcours web', slug: `${tag}-web`, content: 'Contenu', prerequisites: 'HTML' },
    { courseId: ids[0], locale: 'en', title: 'Web track', slug: `${tag}-web-en`, content: 'Body' },
    { courseId: ids[1], locale: 'fr', title: 'Brouillon', slug: `${tag}-brouillon`, content: '' },
  ]);
});

afterAll(async () => {
  if (formationId) await getDrizzle().delete(formations).where(inArray(formations.id, [formationId]));
  if (ids.length) await getDrizzle().delete(courses).where(inArray(courses.id, ids));
});

describe('module courses', () => {
  it('déclare ses capacités avec fournisseurs', () => {
    expect(coursesModule.capabilities.localization).toBe(true);
    expect(coursesModule.capabilities.media).toBe(true);
  });

  it('lit une course publiée par slug localisé, sans repli de locale', async () => {
    const fr = await loadPublishedCourseBySlug('fr', `${tag}-web`);
    expect(fr?.title).toBe('Parcours web');
    expect(fr?.level).toBe('BEGINNER');
    expect(fr?.prerequisites).toBe('HTML');
    expect(await loadPublishedCourseBySlug('en', `${tag}-web`)).toBeNull();
    expect(await loadPublishedCourseBySlug('es', `${tag}-web-en`)).toBeNull();
  });

  it('masque les brouillons et ne remonte pas le global dans une organisation', async () => {
    expect(await loadPublishedCourseBySlug('fr', `${tag}-brouillon`)).toBeNull();
    const slugs = (await loadPublishedCourses('fr')).map((f) => f.slug);
    expect(slugs).toContain(`${tag}-web`);
    expect(slugs).not.toContain(`${tag}-brouillon`);
    expect(await loadPublishedCourseBySlug('fr', `${tag}-web`, 'org-inexistante')).toBeNull();
  });

  it('refuse une durée nulle et un prix négatif', async () => {
    const db = getDrizzle();
    await expect(db.insert(courses).values({ slug: `${tag}-bad`, title: 'x', durationMinutes: 0 })).rejects.toThrow();
    await expect(db.insert(courses).values({ slug: `${tag}-bad2`, title: 'x', priceMinor: -1 })).rejects.toThrow();
  });
});

describe('plan de cours et liaison formation → cours', () => {
  it('ordonne les leçons localisées sans repli et liste les cours publiés d\'un parcours', async () => {
    const db = getDrizzle();
    const lessons = await db.insert(courseLessons).values([
      { courseId: ids[0], position: 1, durationMinutes: 30 },
      { courseId: ids[0], position: 0 },
    ]).returning({ id: courseLessons.id });
    await db.insert(courseLessonTranslations).values([
      { lessonId: lessons[0].id, locale: 'fr', title: 'Deux' },
      { lessonId: lessons[1].id, locale: 'fr', title: 'Un' },
      { lessonId: lessons[1].id, locale: 'en', title: 'One' },
    ]);
    expect((await loadCourseLessons(ids[0], 'fr')).map((l) => l.title)).toEqual(['Un', 'Deux']);
    expect((await loadCourseLessons(ids[0], 'en')).map((l) => l.title)).toEqual(['One']);
    await expect(db.insert(courseLessons).values({ courseId: ids[0], position: 0 })).rejects.toThrow();

    const [f] = await db.insert(formations).values({ slug: `${tag}-f`, title: 'F', status: 'PUBLISHED' }).returning({ id: formations.id });
    formationId = f.id;
    await db.insert(formationCourses).values([
      { formationId, courseId: ids[1], position: 0 },
      { formationId, courseId: ids[0], position: 1 },
    ]);
    expect((await loadPublishedCoursesByFormation(formationId, 'fr')).map((c) => c.id)).toEqual([ids[0]]);
  });
});
