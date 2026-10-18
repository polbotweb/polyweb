import { Effect } from 'effect';
import { z } from 'astro/zod';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDrizzle } from '@database/drizzle';
import { pages, pageSections } from '@database/schemas';
import { invalidateCache } from '@database/cache';
import { apiRoute } from '@/lib/effect/http';
import { attempt, rateLimit, retryAfterSeconds } from '@/lib/effect/route';
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

type ImportedPage = z.infer<typeof pageSchema>;

/** Importe (crée ou met à jour) une page et ses sections dans une transaction. */
const importPage = (pageData: ImportedPage, userId: string) =>
  attempt(`content-import ${pageData.locale}/${pageData.slug}`, () =>
    getDrizzle().transaction(async (tx) => {
      const { sections, publishedAt, ...pageFields } = pageData;
      const values = { ...pageFields, publishedAt: publishedAt ? new Date(publishedAt) : null, updatedBy: userId };
      const [existing] = await tx
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.locale, pageFields.locale), eq(pages.slug, pageFields.slug)))
        .limit(1);
      let pageId: string | undefined;
      if (existing) {
        await tx.update(pages).set(values).where(eq(pages.id, existing.id));
        pageId = existing.id;
        // Remplacement des sections uniquement si l'import en fournit.
        if (sections.length > 0) await tx.delete(pageSections).where(eq(pageSections.pageId, existing.id));
      } else {
        const [newPage] = await tx.insert(pages).values(values).returning({ id: pages.id });
        pageId = newPage?.id;
      }
      if (sections.length > 0 && pageId) {
        const id = pageId;
        await tx.insert(pageSections).values(
          sections.map((s) => ({ pageId: id, type: s.type, content: s.content, sortOrder: s.sortOrder, isVisible: s.isVisible, updatedBy: userId })),
        );
      }
      return existing ? ('updated' as const) : ('created' as const);
    }),
  );

export const POST = apiRoute(({ request, clientAddress }) =>
  Effect.gen(function* () {
    const session = yield* attempt('auth.session', () => auth.api.getSession({ headers: request.headers }));
    if (!session || session.user.role !== 'admin') return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });

    const userId = session.user.id;
    const rl = yield* rateLimit(`content-import:${userId}`, { window: 60, max: 3 });
    if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds(rl) } });

    const body = yield* Effect.tryPromise(() => request.json() as Promise<unknown>).pipe(Effect.option);
    if (body._tag === 'None') return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
    const parsed = importSchema.safeParse(body.value);
    if (!parsed.success) {
      return Response.json({ error: 'VALIDATION_ERROR', details: z.flattenError(parsed.error).fieldErrors }, { status: 400 });
    }
    const data = parsed.data;

    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const pageData of data.pages) {
      const outcome = yield* importPage(pageData, userId).pipe(Effect.result);
      if (outcome._tag === 'Success') {
        if (outcome.success === 'created') created++;
        else updated++;
      } else {
        yield* Effect.logError(`[content-import] ${outcome.failure.operation} failed`, outcome.failure.cause);
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
  }),
);
