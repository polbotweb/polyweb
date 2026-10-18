/**
 * Registre de blocs typés (brique a).
 *
 * Un contenu "blocs" est stocké en JSONB sous la forme :
 *   { version: 1, blocks: [{ id, type, data }] }
 * Chaque type de bloc déclare un schéma zod (validation à l'écriture) et un
 * rendu HTML serveur sûr. Les plugins (brique i) peuvent enregistrer leurs blocs.
 */
import { z } from "astro/zod";
import { escapeHtml, safeHref, tiptapToHtml, tiptapToText } from "./tiptap-html";

export interface BlockDefinition<T = unknown> {
  type: string;
  label: string;
  schema: z.ZodType<T>;
  render: (data: T) => string;
  toText?: (data: T) => string;
  /** Champs simples pour l'éditeur générique (les blocs richText ont un éditeur TipTap dédié). */
  editorFields?: Array<{ name: string; label: string; kind: "text" | "textarea" | "select" | "url" | "number"; options?: string[] }>;
  source?: string; // "core" ou id de plugin
}

const registry = new Map<string, BlockDefinition>();

export function registerBlock<T>(def: BlockDefinition<T>): void {
  if (!/^[a-z][a-zA-Z0-9-]{0,40}$/.test(def.type)) throw new Error(`Type de bloc invalide : ${def.type}`);
  if (registry.has(def.type)) throw new Error(`Bloc déjà enregistré : ${def.type}`);
  registry.set(def.type, def as BlockDefinition);
}

export function unregisterBlock(type: string): void { registry.delete(type); }
export function getBlock(type: string): BlockDefinition | undefined { return registry.get(type); }
export function listBlocks(): BlockDefinition[] { return [...registry.values()]; }

const ALLOWED_EMBED_HOSTS = ["www.youtube.com", "youtube.com", "youtu.be", "www.youtube-nocookie.com", "player.vimeo.com", "vimeo.com"];

export function toEmbedUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" || !ALLOWED_EMBED_HOSTS.includes(u.hostname)) return null;
  if (u.hostname === "youtu.be") return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.pathname.slice(1))}`;
  if (u.hostname.endsWith("youtube.com")) {
    const id = u.searchParams.get("v") ?? (u.pathname.startsWith("/embed/") ? u.pathname.slice(7) : null);
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
  }
  if (u.hostname === "vimeo.com") return `https://player.vimeo.com/video/${encodeURIComponent(u.pathname.slice(1))}`;
  return u.toString();
}

const tiptapDoc = z.object({ type: z.literal("doc"), content: z.array(z.any()).max(5000).optional() }).passthrough();

function registerCoreBlocks() {
  registerBlock({
    type: "richText", label: "Texte riche", source: "core",
    schema: z.object({ doc: tiptapDoc }),
    render: (d) => `<div class="pw-block pw-richtext">${tiptapToHtml(d.doc)}</div>`,
    toText: (d) => tiptapToText(d.doc),
  });
  registerBlock({
    type: "heading", label: "Titre", source: "core",
    schema: z.object({ level: z.coerce.number().int().min(2).max(4).default(2), text: z.string().min(1).max(300) }),
    render: (d) => `<h${d.level} class="pw-block pw-heading">${escapeHtml(d.text)}</h${d.level}>`,
    toText: (d) => d.text,
    editorFields: [{ name: "level", label: "Niveau (2-4)", kind: "number" }, { name: "text", label: "Texte", kind: "text" }],
  });
  registerBlock({
    type: "image", label: "Image", source: "core",
    schema: z.object({ url: z.string().max(2000), alt: z.string().max(300).default(""), caption: z.string().max(500).optional() }),
    render: (d) => {
      const src = safeHref(d.url);
      if (!src) return "";
      const cap = d.caption ? `<figcaption>${escapeHtml(d.caption)}</figcaption>` : "";
      return `<figure class="pw-block pw-image"><img src="${escapeHtml(src)}" alt="${escapeHtml(d.alt)}" loading="lazy" decoding="async">${cap}</figure>`;
    },
    toText: (d) => [d.alt, d.caption].filter(Boolean).join(" "),
    editorFields: [{ name: "url", label: "URL de l'image", kind: "url" }, { name: "alt", label: "Texte alternatif", kind: "text" }, { name: "caption", label: "Légende", kind: "text" }],
  });
  registerBlock({
    type: "quote", label: "Citation", source: "core",
    schema: z.object({ text: z.string().min(1).max(5000), cite: z.string().max(300).optional() }),
    render: (d) => `<blockquote class="pw-block pw-quote"><p>${escapeHtml(d.text)}</p>${d.cite ? `<cite>${escapeHtml(d.cite)}</cite>` : ""}</blockquote>`,
    toText: (d) => `${d.text} ${d.cite ?? ""}`,
    editorFields: [{ name: "text", label: "Citation", kind: "textarea" }, { name: "cite", label: "Auteur / source", kind: "text" }],
  });
  registerBlock({
    type: "code", label: "Code", source: "core",
    schema: z.object({ language: z.string().regex(/^[a-z0-9+#-]{0,20}$/i).optional(), code: z.string().max(50_000) }),
    render: (d) => `<pre class="pw-block pw-code"><code${d.language ? ` class="language-${d.language}"` : ""}>${escapeHtml(d.code)}</code></pre>`,
    editorFields: [{ name: "language", label: "Langage", kind: "text" }, { name: "code", label: "Code", kind: "textarea" }],
  });
  registerBlock({
    type: "embed", label: "Vidéo (YouTube/Vimeo)", source: "core",
    schema: z.object({ url: z.string().url().refine((u) => toEmbedUrl(u) !== null, "seuls YouTube et Vimeo (https) sont autorisés"), title: z.string().max(200).default("Vidéo") }),
    render: (d) => {
      const src = toEmbedUrl(d.url);
      return src ? `<div class="pw-block pw-embed"><iframe src="${escapeHtml(src)}" title="${escapeHtml(d.title)}" loading="lazy" allowfullscreen sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : "";
    },
    editorFields: [{ name: "url", label: "URL de la vidéo", kind: "url" }, { name: "title", label: "Titre accessible", kind: "text" }],
  });
  registerBlock({
    type: "callout", label: "Encadré", source: "core",
    schema: z.object({ tone: z.enum(["info", "success", "warning"]).default("info"), text: z.string().min(1).max(2000) }),
    render: (d) => `<aside class="pw-block pw-callout pw-callout-${d.tone}" role="note">${escapeHtml(d.text)}</aside>`,
    toText: (d) => d.text,
    editorFields: [{ name: "tone", label: "Ton", kind: "select", options: ["info", "success", "warning"] }, { name: "text", label: "Texte", kind: "textarea" }],
  });
  registerBlock({
    type: "cta", label: "Bouton d'action", source: "core",
    schema: z.object({ label: z.string().min(1).max(120), href: z.string().max(2000).refine((h) => safeHref(h) !== null, "lien invalide") }),
    render: (d) => `<p class="pw-block pw-cta"><a class="pw-cta-link" href="${escapeHtml(safeHref(d.href)!)}">${escapeHtml(d.label)}</a></p>`,
    toText: (d) => d.label,
    editorFields: [{ name: "label", label: "Libellé", kind: "text" }, { name: "href", label: "Lien", kind: "url" }],
  });
  registerBlock({
    type: "divider", label: "Séparateur", source: "core",
    schema: z.object({}).passthrough(),
    render: () => `<hr class="pw-block pw-divider">`,
  });
}

registerCoreBlocks();

export interface Block { id: string; type: string; data: unknown }
export interface BlocksDocument { version: 1; blocks: Block[] }

export const EMPTY_BLOCKS: BlocksDocument = { version: 1, blocks: [] };

const rawDocSchema = z.object({
  version: z.literal(1),
  blocks: z.array(z.object({ id: z.string().min(1).max(64), type: z.string().min(1).max(41), data: z.unknown() })).max(500),
});

export class BlockValidationError extends Error {
  constructor(public readonly issues: Array<{ index: number; type: string; message: string }>) {
    super(`Blocs invalides : ${issues.map((i) => `#${i.index} ${i.type}: ${i.message}`).join("; ")}`);
  }
}

/** Valide et normalise un document de blocs (types connus uniquement). */
export function parseBlocksDocument(input: unknown): BlocksDocument {
  const value = typeof input === "string" ? (input.trim() ? JSON.parse(input) : EMPTY_BLOCKS) : input ?? EMPTY_BLOCKS;
  const doc = rawDocSchema.parse(value);
  const issues: Array<{ index: number; type: string; message: string }> = [];
  const ids = new Set<string>();
  const blocks: Block[] = doc.blocks.map((b, index) => {
    const def = registry.get(b.type);
    if (!def) { issues.push({ index, type: b.type, message: "type de bloc inconnu" }); return b; }
    if (ids.has(b.id)) issues.push({ index, type: b.type, message: "id dupliqué" });
    ids.add(b.id);
    const r = def.schema.safeParse(b.data);
    if (!r.success) { issues.push({ index, type: b.type, message: r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ") }); return b; }
    return { id: b.id, type: b.type, data: r.data };
  });
  if (issues.length) throw new BlockValidationError(issues);
  return { version: 1, blocks };
}

export function renderBlocksToHtml(doc: BlocksDocument | null | undefined): string {
  if (!doc?.blocks) return "";
  return doc.blocks
    .map((b) => {
      const def = registry.get(b.type);
      if (!def) return "";
      const r = def.schema.safeParse(b.data);
      return r.success ? def.render(r.data) : "";
    })
    .join("\n");
}

export function blocksToText(doc: BlocksDocument | null | undefined): string {
  if (!doc?.blocks) return "";
  return doc.blocks
    .map((b) => {
      const def = registry.get(b.type);
      if (!def?.toText) return "";
      const r = def.schema.safeParse(b.data);
      return r.success ? def.toText(r.data) : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}
