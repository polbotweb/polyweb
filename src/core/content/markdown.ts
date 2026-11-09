/**
 * Rendu Markdown sûr pour les contenus d'utilisateurs (forums, commentaires…), sans dépendance.
 *
 * Sous-ensemble volontairement réduit : paragraphes, sauts de ligne, titres (décalés : `#` → h3
 * pour ne jamais concurrencer le plan de la page), citations, listes, règles, blocs et spans de
 * code, gras, italique, liens http(s)/mailto/relatifs et URL nues, mentions `@pseudo`. Aucune
 * image ni HTML brut : TOUT le texte source est échappé avant transformation, puis le résultat
 * repasse par `sanitizeHtml` (DOMPurify, liste blanche) — double barrière.
 * Liens : `rel="nofollow ugc noopener noreferrer"` (contenu tiers).
 */
import { safeUrl, sanitizeHtml } from "@/lib/sanitize";

export const MARKDOWN_SOURCE_MAX = 20_000;
const MENTION = /(^|[^\p{L}\p{N}_@/])@([a-zA-Z0-9][a-zA-Z0-9_.-]{1,30})/gu;

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const unescapeAttr = (v: string) => v.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function link(href: string, label: string): string {
  const url = safeUrl(unescapeAttr(href));
  if (!url) return label;
  return `<a href="${escapeHtml(url)}" rel="nofollow ugc noopener noreferrer">${label}</a>`;
}

/** Transformations en ligne sur du texte DÉJÀ échappé. */
function inline(escaped: string): string {
  const codes: string[] = [];
  let out = escaped.replace(/`([^`\n]+)`/g, (_, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  const links: string[] = [];
  out = out.replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)/g, (_, label: string, href: string) => {
    links.push(link(href, label));
    return `\u0001${links.length - 1}\u0001`;
  });
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<()]{2,2000})/g, (_, lead: string, url: string) => {
    links.push(link(url, url));
    return `${lead}\u0001${links.length - 1}\u0001`;
  });
  out = out
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>")
    .replace(MENTION, (_, lead: string, name: string) => `${lead}<span class="mention">@${name}</span>`);
  return out
    .replace(/\u0001(\d+)\u0001/g, (_, i: string) => links[Number(i)] ?? "")
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)] ?? "");
}

/** Markdown (sous-ensemble) → HTML assaini. Entrée tronquée à `MARKDOWN_SOURCE_MAX`. */
export function renderMarkdown(source: string): string {
  // Les caractères de contrôle U+0000/U+0001 servent de marqueurs internes : retirés de la source.
  const lines = escapeHtml(String(source ?? "").slice(0, MARKDOWN_SOURCE_MAX).replace(/[\u0000\u0001]/g, "").replace(/\r\n?/g, "\n")).split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) html.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      html.push(`<pre><code>${code.join("\n")}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { flush(); const level = Math.min(6, heading[1].length + 2); html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flush(); html.push("<hr>"); continue; }
    if (/^&gt;\s?/.test(line)) {
      flush();
      const quote: string[] = [];
      for (; i < lines.length && /^&gt;\s?/.test(lines[i]); i++) quote.push(lines[i].replace(/^&gt;\s?/, ""));
      i--;
      html.push(`<blockquote><p>${quote.map(inline).join("<br>")}</p></blockquote>`);
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.+)$/;
    const ordered = /^\s*\d{1,9}[.)]\s+(.+)$/;
    const listKind = bullet.test(line) ? "ul" : ordered.test(line) ? "ol" : null;
    if (listKind) {
      flush();
      const re = listKind === "ul" ? bullet : ordered;
      const items: string[] = [];
      for (; i < lines.length && re.test(lines[i]); i++) items.push(`<li>${inline(re.exec(lines[i])![1])}</li>`);
      i--;
      html.push(`<${listKind}>${items.join("")}</${listKind}>`);
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return sanitizeHtml(html.join("\n"));
}

/** Pseudos mentionnés (`@pseudo`, hors blocs de code), uniques, en minuscules, bornés. */
export function extractMentions(source: string, max = 10): string[] {
  const text = String(source ?? "").replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
  const found = new Set<string>();
  for (const match of text.matchAll(MENTION)) {
    found.add(match[2].toLowerCase());
    if (found.size >= max) break;
  }
  return [...found];
}
