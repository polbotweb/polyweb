/**
 * Révisions d'entrées + diff (brique f).
 * Chaque sauvegarde/changement de statut écrit un instantané complet (toutes
 * traductions). Le diff compare deux instantanés champ par champ, avec un diff
 * mot à mot sur les textes (paquet `diff`).
 */
import { and, desc, eq } from "drizzle-orm";
import { diffWords, diffJson } from "diff";
import { getDrizzle, schema } from "@database/drizzle";
import { blocksToText } from "@/core/blocks/registry";
import type { EntrySnapshot } from "@database/schemas/content.schema";
import { updateEntry, setEntryStatus, type Entry } from "./entries";
import type { ContentType } from "./content-types";

export type Revision = typeof schema.contentEntryRevisions.$inferSelect;

export async function listRevisions(entryId: string, limit = 50): Promise<Revision[]> {
  return getDrizzle().select().from(schema.contentEntryRevisions).where(eq(schema.contentEntryRevisions.entryId, entryId)).orderBy(desc(schema.contentEntryRevisions.version)).limit(limit);
}

export async function getRevision(entryId: string, version: number): Promise<Revision | undefined> {
  const [r] = await getDrizzle().select().from(schema.contentEntryRevisions).where(and(eq(schema.contentEntryRevisions.entryId, entryId), eq(schema.contentEntryRevisions.version, version)));
  return r;
}

export type DiffPart = { value: string; added?: boolean; removed?: boolean };
export interface FieldDiff { path: string; kind: "added" | "removed" | "changed"; parts: DiffPart[] }

function flatten(s: EntrySnapshot): Map<string, string> {
  const m = new Map<string, string>();
  m.set("slug", s.slug);
  m.set("status", s.status);
  for (const [k, v] of Object.entries(s.sharedData ?? {})) m.set(`shared.${k}`, typeof v === "string" ? v : JSON.stringify(v));
  for (const t of s.translations) {
    m.set(`${t.locale}.title`, t.title);
    for (const [k, v] of Object.entries(t.data ?? {})) m.set(`${t.locale}.${k}`, typeof v === "string" ? v : JSON.stringify(v));
    const blocksText = blocksToText(t.blocks);
    if (blocksText || t.blocks?.blocks?.length) m.set(`${t.locale}.blocks`, blocksText);
    if (t.blocks?.blocks?.length) m.set(`${t.locale}.blocks(structure)`, JSON.stringify(t.blocks.blocks.map((b) => b.type)));
    for (const [k, v] of Object.entries(t.seo ?? {})) if (v !== undefined) m.set(`${t.locale}.seo.${k}`, String(v));
  }
  return m;
}

/** Pur : différences entre deux instantanés. */
export function diffSnapshots(a: EntrySnapshot, b: EntrySnapshot): FieldDiff[] {
  const fa = flatten(a);
  const fb = flatten(b);
  const keys = [...new Set([...fa.keys(), ...fb.keys()])].sort();
  const out: FieldDiff[] = [];
  for (const path of keys) {
    const va = fa.get(path);
    const vb = fb.get(path);
    if (va === vb) continue;
    if (va === undefined) out.push({ path, kind: "added", parts: [{ value: vb!, added: true }] });
    else if (vb === undefined) out.push({ path, kind: "removed", parts: [{ value: va, removed: true }] });
    else out.push({ path, kind: "changed", parts: diffWords(va, vb).map((p) => ({ value: p.value, added: p.added || undefined, removed: p.removed || undefined })) });
  }
  return out;
}

/** Diff JSON brut (affichage "technique"). */
export function rawSnapshotDiff(a: EntrySnapshot, b: EntrySnapshot): DiffPart[] {
  return diffJson(a, b).map((p) => ({ value: p.value, added: p.added || undefined, removed: p.removed || undefined }));
}

/** Restaure une révision : crée une nouvelle version identique à l'instantané (historique conservé). */
export async function restoreRevision(type: ContentType, entryId: string, version: number, opts: { authorId: string | null; allowedLocales: readonly string[] }): Promise<Entry> {
  const rev = await getRevision(entryId, version);
  if (!rev) throw new Error("Révision introuvable");
  const s = rev.snapshot;
  // Les traductions absentes de l'instantané sont supprimées pour une restauration fidèle.
  const keep = s.translations.map((t) => t.locale);
  const db = getDrizzle();
  const existing = await db.select({ locale: schema.contentEntryTranslations.locale }).from(schema.contentEntryTranslations).where(eq(schema.contentEntryTranslations.entryId, entryId));
  for (const { locale } of existing) {
    if (!keep.includes(locale)) await db.delete(schema.contentEntryTranslations).where(and(eq(schema.contentEntryTranslations.entryId, entryId), eq(schema.contentEntryTranslations.locale, locale)));
  }
  let entry = await updateEntry(type, entryId, {
    slug: s.slug,
    sharedData: s.sharedData,
    translations: Object.fromEntries(s.translations.map((t) => [t.locale, { title: t.title, data: t.data, blocks: t.blocks ?? undefined, seo: t.seo }])),
    message: `Restauration de la version ${version}`,
  }, opts);
  if (entry.status !== s.status) entry = await setEntryStatus(type, entryId, s.status, opts.authorId);
  return entry;
}
