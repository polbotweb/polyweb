import type { APIRoute } from 'astro';
import { z } from 'astro/zod';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDrizzle } from '@database/drizzle';
import { pages, pageSections } from '@database/schemas';
import { invalidateCache } from '@database/cache';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAuditEvent, extractIp } from '@/lib/audit';

export const prerender = false;

const sectionSchema = z.object({
  type: z.string().min(1).max(50),
  content: z.unknown(),
  sortOrder: z.number().int().min(0).max(10000),
  isVisible: z.boolean(),
});

const pageSchema = z.object({
  locale: z.string().min(2).max(10),
  slug: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  metaTitle: z.string().max(70).nullable().optional(),
  metaDescription: z.string().max(160).nullable().optional(),
  ogImage: z.string().max(500).nullable().optional(),
  canonical: z.string().max(500).nullable().optional(),
  robots: z.string().max(200).nullable().optional(),
  template: z.string().max(50).optional().default('default'),
  isPublished: z.boolean().optional().default(false),
  publishedAt: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional().default(0),
  sections: z.array(sectionSchema).max(200).optional().default([]),
});

const importSchema = z.object({
  version: z.number().int().min(1).max(1),
  pages: z.array(pageSchema).min(1).max(1000),
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.role !== 'admin') {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const userId = session.user.id;
  const rl = checkRateLimit(`content-import:${userId}`, { window: 60, max: 3 });
  if (!rl.allowed) {
    return Response.json(
      { error: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'VALIDATION_ERROR', details: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const db = getDrizzle();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const pageData of data.pages) {
    const { sections, publishedAt, ...pageFields } = pageData;

    // Check if page already exists for this locale+slug
    const [existing] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.locale, pageFields.locale), eq(pages.slug, pageFields.slug)))
      .limit(1);

    try {
      if (existing) {
        // Update existing page
        await db
          .update(pages)
          .set({
            ...pageFields,
            publishedAt: publishedAt ? new Date(publishedAt) : null,
            updatedBy: userId,
          })
          .where(eq(pages.id, existing.id));

        // Replace sections: delete old, insert new
        if (sections.length > 0) {
          await db.delete(pageSections).where(eq(pageSections.pageId, existing.id));
          await db.insert(pageSections).values(
            sections.map((s) => ({
              pageId: existing.id,
              type: s.type,
              content: s.content,
              sortOrder: s.sortOrder,
              isVisible: s.isVisible,
              updatedBy: userId,
            })),
          );
        }
        updated++;
      } else {
        // Create new page
        const [newPage] = await db
          .insert(pages)
          .values({
            ...pageFields,
            publishedAt: publishedAt ? new Date(publishedAt) : null,
            updatedBy: userId,
          })
          .returning({ id: pages.id });

        // Insert sections
        if (sections.length > 0 && newPage) {
          await db.insert(pageSections).values(
            sections.map((s) => ({
              pageId: newPage.id,
              type: s.type,
              content: s.content,
              sortOrder: s.sortOrder,
              isVisible: s.isVisible,
              updatedBy: userId,
            })),
          );
        }
        created++;
      }
    } catch (err: unknown) {
      console.error(`[content-import] Failed to import page ${pageFields.locale}/${pageFields.slug}:`, err);
      skipped++;
    }
  }

  invalidateCache('page:');

  void logAuditEvent({
    userId,
    action: 'CONTENT_IMPORT',
    resource: 'pages',
    resourceId: null,
    metadata: { created, updated, skipped, total: data.pages.length },
    ipAddress: extractIp(request.headers, clientAddress),
    userAgent: request.headers.get('user-agent'),
  }).catch(() => {});

  return Response.json({ success: true, created, updated, skipped });
};
