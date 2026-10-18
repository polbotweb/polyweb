/** Types de contenu définis depuis l'admin (brique b) — schéma dynamique stocké en JSONB. */
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "astro/zod";
import { getDrizzle, schema } from "@database/drizzle";
import { fieldListSchema, type FieldDefinition } from "@/core/content-types/fields";
import type { ContentTypeSettings } from "@database/schemas/content.schema";

export type ContentType = typeof schema.contentTypes.$inferSelect;

export const contentTypeInputSchema = z.object({
  slug: z.string().trim().regex(/^[a-z][a-z0-9-]{0,62}$/, "slug : minuscules, chiffres, tirets"),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  fields: z.preprocess((v) => (typeof v === "string" ? JSON.parse(v || "[]") : v), fieldListSchema()),
  settings: z
    .object({
      hasBlocks: z.boolean().default(true),
      publicRead: z.boolean().default(true),
      singleton: z.boolean().default(false),
      icon: z.string().max(40).optional(),
    })
    .default({ hasBlocks: true, publicRead: true, singleton: false }),
});
export type ContentTypeInput = z.input<typeof contentTypeInputSchema>;

export class ContentTypeConflictError extends Error {}

export async function listContentTypes(siteId: string): Promise<ContentType[]> {
  return getDrizzle().select().from(schema.contentTypes).where(eq(schema.contentTypes.siteId, siteId)).orderBy(asc(schema.contentTypes.name));
}

export async function getContentType(siteId: string, slugOrId: string): Promise<ContentType | undefined> {
  const db = getDrizzle();
  const [t] = await db
    .select()
    .from(schema.contentTypes)
    .where(and(eq(schema.contentTypes.siteId, siteId), sql`(${schema.contentTypes.slug} = ${slugOrId} OR ${schema.contentTypes.id} = ${slugOrId})`))
    .limit(1);
  return t;
}

export async function createContentType(siteId: string, input: ContentTypeInput): Promise<ContentType> {
  const data = contentTypeInputSchema.parse(input);
  if (await getContentType(siteId, data.slug)) throw new ContentTypeConflictError(`Le type "${data.slug}" existe déjà`);
  const [row] = await getDrizzle()
    .insert(schema.contentTypes)
    .values({ siteId, slug: data.slug, name: data.name, description: data.description ?? null, fields: data.fields as FieldDefinition[], settings: data.settings as ContentTypeSettings })
    .returning();
  return row!;
}

export async function updateContentType(siteId: string, id: string, input: ContentTypeInput): Promise<ContentType> {
  const data = contentTypeInputSchema.parse(input);
  const clash = await getContentType(siteId, data.slug);
  if (clash && clash.id !== id) throw new ContentTypeConflictError(`Le type "${data.slug}" existe déjà`);
  // Les données existantes des champs supprimés restent en JSONB (non destructif) mais ne sont plus exposées.
  const [row] = await getDrizzle()
    .update(schema.contentTypes)
    .set({ slug: data.slug, name: data.name, description: data.description ?? null, fields: data.fields as FieldDefinition[], settings: data.settings as ContentTypeSettings })
    .where(and(eq(schema.contentTypes.id, id), eq(schema.contentTypes.siteId, siteId)))
    .returning();
  if (!row) throw new Error("Type de contenu introuvable");
  return row;
}

export async function deleteContentType(siteId: string, id: string): Promise<void> {
  await getDrizzle().delete(schema.contentTypes).where(and(eq(schema.contentTypes.id, id), eq(schema.contentTypes.siteId, siteId)));
}

export async function countEntriesByType(siteId: string): Promise<Record<string, number>> {
  const rows = await getDrizzle()
    .select({ typeId: schema.contentEntries.typeId, n: sql<number>`count(*)::int` })
    .from(schema.contentEntries)
    .where(eq(schema.contentEntries.siteId, siteId))
    .groupBy(schema.contentEntries.typeId);
  return Object.fromEntries(rows.map((r) => [r.typeId, r.n]));
}
