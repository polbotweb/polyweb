import type { APIRoute } from "astro";
import { sql, eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { organization } from "@database/schemas";
import { isValidLocale } from "@i18n/utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { DEFAULT_LOCALE } from "@i18n/config";
import { buildBlogPostUrl } from "@/lib/blog/utils";
import { buildServiceUrl } from "@/modules/services/utils";
import { publicBlogPostColumnsScope } from "@/lib/blog/public-visibility";
import { buildTsQuery, getRegconfig } from "@/core/search";
export { buildTsQuery, getRegconfig };

export const prerender = false;
const ERROR_CODES = { QUERY_TOO_SHORT: "QUERY_TOO_SHORT", INVALID_LOCALE: "INVALID_LOCALE", RATE_LIMITED: "RATE_LIMITED" } as const;

export const GET: APIRoute = async ({ url, clientAddress }) => {
  const q = url.searchParams.get("q")?.trim();
  const locale = url.searchParams.get("locale") ?? DEFAULT_LOCALE;
  const orgSlug = url.searchParams.get("org")?.trim() || null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 100);
  if (!q || q.length < 2) return new Response(JSON.stringify({ error: ERROR_CODES.QUERY_TOO_SHORT }), { status: 400, headers: { "Content-Type": "application/json" } });
  if (!isValidLocale(locale)) return new Response(JSON.stringify({ error: ERROR_CODES.INVALID_LOCALE }), { status: 400, headers: { "Content-Type": "application/json" } });
  const rl = checkRateLimit(`search_${clientAddress}`, { window: 60, max: 60 });
  if (!rl.allowed) return new Response(JSON.stringify({ error: ERROR_CODES.RATE_LIMITED }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } });

  const tsQuery = buildTsQuery(q);
  if (!tsQuery) return new Response(JSON.stringify({ error: ERROR_CODES.QUERY_TOO_SHORT }), { status: 400, headers: { "Content-Type": "application/json" } });

  const db = getDrizzle();
  const regconfig = getRegconfig(locale);
  let orgId: string | null = null;
  if (orgSlug) {
    const [orgRow] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, orgSlug)).limit(1);
    orgId = orgRow?.id ?? null;
    if (!orgId) return new Response(JSON.stringify({ query: q, locale, count: 0, results: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const blogOrganizationPredicate = orgId ? sql`bp.organization_id = ${orgId}` : sql`bp.organization_id IS NULL`;
  const serviceOrganizationPredicate = orgId ? sql`s.organization_id = ${orgId}` : sql`s.organization_id IS NULL`;
  const blogPublicationPredicate = publicBlogPostColumnsScope(sql.raw("bp.status"), sql.raw("bp.published_at"));

  const raw = await db.execute<{
    type: "page" | "blog_post" | "service";
    id: string;
    slug: string;
    category_slug: string | null;
    title: string;
    excerpt: string | null;
    published_at: Date | null;
    rank: number;
    headline: string;
  }>(sql`
    SELECT * FROM (
      SELECT
        'page' AS type,
        p.id,
        p.slug,
        NULL::text AS category_slug,
        p.title,
        p.meta_description AS excerpt,
        p.published_at,
        ts_rank(p.search_vector, to_tsquery(${sql.raw(`'${regconfig}'`)}, ${tsQuery})) AS rank,
        ts_headline(${sql.raw(`'${regconfig}'`)}, coalesce(p.meta_description, p.title), to_tsquery(${sql.raw(`'${regconfig}'`)}, ${tsQuery}), 'MaxWords=30, MinWords=10, StartSel=<mark>, StopSel=</mark>') AS headline
      FROM pages p
      WHERE p.search_vector @@ to_tsquery(${sql.raw(`'${regconfig}'`)}, ${tsQuery})
        AND p.locale = ${locale}
        AND p.deleted_at IS NULL
        AND (p.is_published = true OR p.scheduled_at <= NOW())

      UNION ALL

      SELECT
        'blog_post' AS type,
        bp.id,
        bpt.slug,
        (SELECT min(coalesce(bct.slug, bc.slug)) FROM blog_post_categories bpc JOIN blog_categories bc ON bc.id = bpc.category_id LEFT JOIN blog_category_translations bct ON bct.category_id = bc.id AND bct.locale = ${locale} WHERE bpc.post_id = bp.id) AS category_slug,
        bpt.title,
        bpt.excerpt,
        bp.published_at,
        ts_rank(bpt.search_vector, to_tsquery(${sql.raw(`'${regconfig}'`)}, ${tsQuery})) AS rank,
        ts_headline(${sql.raw(`'${regconfig}'`)}, coalesce(bpt.excerpt, bpt.title), to_tsquery(${sql.raw(`'${regconfig}'`)}, ${tsQuery}), 'MaxWords=30, MinWords=10, StartSel=<mark>, StopSel=</mark>') AS headline
      FROM blog_posts bp
      JOIN blog_post_translations bpt ON bpt.post_id = bp.id AND bpt.locale = ${locale}
      WHERE bpt.search_vector @@ to_tsquery(${sql.raw(`'${regconfig}'`)}, ${tsQuery})
        AND ${blogOrganizationPredicate}
        AND ${blogPublicationPredicate}

      UNION ALL

      SELECT
        'service' AS type,
        s.id,
        st.slug,
        (SELECT min(coalesce(sct.slug, sc.slug)) FROM service_category_links scl JOIN service_categories sc ON sc.id = scl.category_id LEFT JOIN service_category_translations sct ON sct.category_id = sc.id AND sct.locale = ${locale} WHERE scl.service_id = s.id) AS category_slug,
        st.title,
        st.excerpt,
        s.published_at,
        ts_rank(st.search_vector, to_tsquery(${sql.raw(`'${regconfig}'`)}, ${tsQuery})) AS rank,
        ts_headline(${sql.raw(`'${regconfig}'`)}, coalesce(st.excerpt, st.title), to_tsquery(${sql.raw(`'${regconfig}'`)}, ${tsQuery}), 'MaxWords=30, MinWords=10, StartSel=<mark>, StopSel=</mark>') AS headline
      FROM services s
      JOIN service_translations st ON st.service_id = s.id AND st.locale = ${locale}
      WHERE st.search_vector @@ to_tsquery(${sql.raw(`'${regconfig}'`)}, ${tsQuery})
        AND ${serviceOrganizationPredicate}
        AND s.status = 'PUBLISHED'
    ) combined
    ORDER BY rank DESC
    LIMIT ${limit}
  `);

  const rows = raw.rows;
  return new Response(JSON.stringify({
    query: q,
    locale,
    count: rows.length,
    results: rows.map((row) => ({
      id: row.id,
      type: row.type,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt ?? null,
      highlight: row.headline,
      rank: row.rank,
      publishedAt: row.published_at,
      url: row.type === "blog_post"
        ? buildBlogPostUrl(locale, orgSlug, row.slug, row.category_slug)
        : row.type === "service"
          ? buildServiceUrl(locale, orgSlug, row.slug, row.category_slug)
          : `/${locale}/${row.slug}`,
    })),
  }), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });
};
