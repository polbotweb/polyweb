/**
 * Collecte des documents indexables (brique k).
 * - entrées de contenu publiées (tous sites, une ligne par traduction) ;
 * - articles, services et pages publiés (modules historiques mono-site,
 *   rattachés au site par défaut, organisation NULL uniquement).
 */
import { Effect } from 'effect';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@database/drizzle';
import { DEFAULT_SITE_ID } from '@database/schemas/content.schema';
import { query } from '@/lib/effect/db';
import { blocksToText } from '@/core/blocks/registry';
import { buildBlogPostUrl } from '@/lib/blog/utils';
import { buildServiceUrl } from '@/modules/services/utils/urls';
import type { Locale } from '@i18n/config';
import { documentId, type SearchDocument } from './search';

/** Texte brut d'une valeur JSON (chaînes, tableaux, documents TipTap). */
export function textOf(value: unknown, depth = 0): string {
  if (depth > 8 || value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map((v) => textOf(v, depth + 1)).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    return Object.entries(o)
      .filter(([k]) => !['type', 'id', 'src', 'href', 'url', 'attrs', 'marks'].includes(k))
      .map(([, v]) => textOf(v, depth + 1))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

const stripMarkdown = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/[#*_`>[\]()!|~-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Documents d'une entrée de contenu (vide si non publiée). */
export const contentEntryDocuments = (entryId: string) =>
  Effect.gen(function* () {
    const rows = yield* query('search.source.entry', (db) =>
      db
        .select({ entry: schema.contentEntries, typeSlug: schema.contentTypes.slug, t: schema.contentEntryTranslations })
        .from(schema.contentEntries)
        .innerJoin(schema.contentTypes, eq(schema.contentTypes.id, schema.contentEntries.typeId))
        .innerJoin(schema.contentEntryTranslations, eq(schema.contentEntryTranslations.entryId, schema.contentEntries.id))
        .where(and(eq(schema.contentEntries.id, entryId), eq(schema.contentEntries.status, 'published'))),
    );
    return rows.map(({ entry, typeSlug, t }) => entryDoc(entry, typeSlug, t));
  });

function entryDoc(
  entry: typeof schema.contentEntries.$inferSelect,
  typeSlug: string,
  t: typeof schema.contentEntryTranslations.$inferSelect,
): SearchDocument {
  const body = [textOf(t.data), textOf(entry.sharedData), blocksToText(t.blocks)].filter(Boolean).join('\n');
  return {
    id: documentId('content', entry.id, t.locale),
    siteId: entry.siteId,
    kind: 'content',
    type: typeSlug,
    entityId: entry.id,
    locale: t.locale,
    title: t.seo?.metaTitle || t.title,
    excerpt: t.seo?.metaDescription || null,
    body,
    url: `/${t.locale}/c/${typeSlug}/${entry.slug}`,
    publishedAt: entry.publishedAt?.toISOString() ?? null,
  };
}

/** Toutes les entrées publiées d'un site. */
export const contentDocumentsForSite = (siteId: string) =>
  Effect.gen(function* () {
    const rows = yield* query('search.source.entries', (db) =>
      db
        .select({ entry: schema.contentEntries, typeSlug: schema.contentTypes.slug, t: schema.contentEntryTranslations })
        .from(schema.contentEntries)
        .innerJoin(schema.contentTypes, eq(schema.contentTypes.id, schema.contentEntries.typeId))
        .innerJoin(schema.contentEntryTranslations, eq(schema.contentEntryTranslations.entryId, schema.contentEntries.id))
        .where(and(eq(schema.contentEntries.siteId, siteId), eq(schema.contentEntries.status, 'published'))),
    );
    return rows.map(({ entry, typeSlug, t }) => entryDoc(entry, typeSlug, t));
  });

type LegacyRow = { id: string; locale: string; slug: string; title: string; excerpt: string | null; content: string | null; category_slug: string | null; published_at: Date | string | null };

/** Articles, services et pages publiés (site par défaut uniquement). */
export const legacyDocuments = Effect.gen(function* () {
  const [blog, services, pages] = yield* Effect.all(
    [
      query('search.source.blog', (db) =>
        db.execute<LegacyRow>(sql`
          SELECT bp.id, bpt.locale, bpt.slug, bpt.title, bpt.excerpt, bpt.content, bp.published_at,
            (SELECT min(coalesce(bct.slug, bc.slug)) FROM blog_post_categories bpc JOIN blog_categories bc ON bc.id = bpc.category_id
              LEFT JOIN blog_category_translations bct ON bct.category_id = bc.id AND bct.locale = bpt.locale WHERE bpc.post_id = bp.id) AS category_slug
          FROM blog_posts bp JOIN blog_post_translations bpt ON bpt.post_id = bp.id
          WHERE bp.organization_id IS NULL AND bp.status = 'PUBLISHED' AND bp.published_at <= now()`),
      ),
      query('search.source.services', (db) =>
        db.execute<LegacyRow>(sql`
          SELECT s.id, st.locale, st.slug, st.title, st.excerpt, st.content, s.published_at,
            (SELECT min(coalesce(sct.slug, sc.slug)) FROM service_category_links scl JOIN service_categories sc ON sc.id = scl.category_id
              LEFT JOIN service_category_translations sct ON sct.category_id = sc.id AND sct.locale = st.locale WHERE scl.service_id = s.id) AS category_slug
          FROM services s JOIN service_translations st ON st.service_id = s.id
          WHERE s.organization_id IS NULL AND s.status = 'PUBLISHED'`),
      ),
      query('search.source.pages', (db) =>
        db.execute<LegacyRow>(sql`
          SELECT p.id, p.locale, p.slug, p.title, p.meta_description AS excerpt, NULL::text AS content, p.published_at, NULL::text AS category_slug
          FROM pages p WHERE p.deleted_at IS NULL AND (p.is_published = true OR p.scheduled_at <= now())`),
      ),
    ],
    { concurrency: 3 },
  );
  const at = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
  const docs: SearchDocument[] = [
    ...blog.rows.map((r) => ({
      id: documentId('blog_post', r.id, r.locale), siteId: DEFAULT_SITE_ID, kind: 'blog_post' as const, type: null, entityId: r.id, locale: r.locale,
      title: r.title, excerpt: r.excerpt, body: stripMarkdown(r.content ?? ''), url: buildBlogPostUrl(r.locale as Locale, null, r.slug, r.category_slug), publishedAt: at(r.published_at),
    })),
    ...services.rows.map((r) => ({
      id: documentId('service', r.id, r.locale), siteId: DEFAULT_SITE_ID, kind: 'service' as const, type: null, entityId: r.id, locale: r.locale,
      title: r.title, excerpt: r.excerpt, body: stripMarkdown(r.content ?? ''), url: buildServiceUrl(r.locale as Locale, null, r.slug, r.category_slug), publishedAt: at(r.published_at),
    })),
    ...pages.rows.map((r) => ({
      id: documentId('page', r.id, r.locale), siteId: DEFAULT_SITE_ID, kind: 'page' as const, type: null, entityId: r.id, locale: r.locale,
      title: r.title, excerpt: r.excerpt, body: '', url: `/${r.locale}/${r.slug}`, publishedAt: at(r.published_at),
    })),
  ];
  return docs;
});
