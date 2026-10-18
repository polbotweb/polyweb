import type { APIRoute } from 'astro';
import { asc, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDrizzle } from '@database/drizzle';
import { pages, pageSections } from '@database/schemas';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAuditEvent, extractIp } from '@/lib/audit';

export const prerender = false;

export const GET: APIRoute = async ({ request, clientAddress }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.role !== 'admin') {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const userId = session.user.id;
  const rl = checkRateLimit(`content-export:${userId}`, { window: 60, max: 5 });
  if (!rl.allowed) {
    return Response.json(
      { error: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const db = getDrizzle();

  const [allPages, allSections] = await Promise.all([
    db
      .select()
      .from(pages)
      .where(isNull(pages.deletedAt))
      .orderBy(asc(pages.locale), asc(pages.sortOrder)),
    db
      .select()
      .from(pageSections)
      .orderBy(asc(pageSections.pageId), asc(pageSections.sortOrder)),
  ]);

  // Group sections by pageId
  const sectionsByPage = new Map<string, typeof allSections>();
  for (const section of allSections) {
    const list = sectionsByPage.get(section.pageId) ?? [];
    list.push(section);
    sectionsByPage.set(section.pageId, list);
  }

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    pages: allPages.map((page) => ({
      locale: page.locale,
      slug: page.slug,
      title: page.title,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      ogImage: page.ogImage,
      canonical: page.canonical,
      robots: page.robots,
      template: page.template,
      isPublished: page.isPublished,
      publishedAt: page.publishedAt?.toISOString() ?? null,
      sortOrder: page.sortOrder,
      sections: (sectionsByPage.get(page.id) ?? []).map((s) => ({
        type: s.type,
        content: s.content,
        sortOrder: s.sortOrder,
        isVisible: s.isVisible,
      })),
    })),
  };

  void logAuditEvent({
    userId,
    action: 'CONTENT_EXPORT',
    resource: 'pages',
    resourceId: null,
    metadata: { pageCount: allPages.length },
    ipAddress: extractIp(request.headers, clientAddress),
    userAgent: request.headers.get('user-agent'),
  }).catch(() => {});

  const filename = `cms-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
