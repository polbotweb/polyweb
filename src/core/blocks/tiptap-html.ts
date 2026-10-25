/**
 * Rendu serveur sûr d'un document TipTap/ProseMirror JSON → HTML (brique a).
 * Liste blanche de nœuds et de marques ; tout texte est échappé ; les liens
 * n'acceptent que http(s), mailto, tel, chemins relatifs et ancres.
 * Aucun HTML brut fourni par l'utilisateur n'est jamais réinjecté.
 */
export interface TipTapMark { type: string; attrs?: Record<string, unknown> }
export interface TipTapNode { type: string; text?: string; attrs?: Record<string, unknown>; marks?: TipTapMark[]; content?: TipTapNode[] }

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const v = href.trim();
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (/^\/(?!\/)/.test(v) || v.startsWith("#")) return v;
  return null;
}

const MAX_DEPTH = 32;

function renderMarks(text: string, marks: TipTapMark[] | undefined): string {
  let out = escapeHtml(text);
  for (const m of marks ?? []) {
    switch (m.type) {
      case "bold": out = `<strong>${out}</strong>`; break;
      case "italic": out = `<em>${out}</em>`; break;
      case "strike": out = `<s>${out}</s>`; break;
      case "underline": out = `<u>${out}</u>`; break;
      case "code": out = `<code>${out}</code>`; break;
      case "link": {
        const href = safeHref(m.attrs?.href);
        if (href) {
          const external = /^https?:/i.test(href);
          out = `<a href="${escapeHtml(href)}"${external ? ' rel="noopener noreferrer nofollow" target="_blank"' : ""}>${out}</a>`;
        }
        break;
      }
      default: break; // marque inconnue : ignorée (texte conservé)
    }
  }
  return out;
}

function renderChildren(node: TipTapNode, depth: number): string {
  return (node.content ?? []).map((c) => renderNode(c, depth + 1)).join("");
}

export function renderNode(node: TipTapNode, depth = 0): string {
  if (!node || typeof node !== "object" || depth > MAX_DEPTH) return "";
  switch (node.type) {
    case "doc": return renderChildren(node, depth);
    case "text": return typeof node.text === "string" ? renderMarks(node.text, node.marks) : "";
    case "paragraph": return `<p>${renderChildren(node, depth)}</p>`;
    case "heading": {
      const level = Math.min(6, Math.max(2, Number(node.attrs?.level) || 2));
      return `<h${level}>${renderChildren(node, depth)}</h${level}>`;
    }
    case "bulletList": return `<ul>${renderChildren(node, depth)}</ul>`;
    case "orderedList": {
      const start = Number(node.attrs?.start);
      return `<ol${Number.isInteger(start) && start > 1 ? ` start="${start}"` : ""}>${renderChildren(node, depth)}</ol>`;
    }
    case "listItem": return `<li>${renderChildren(node, depth)}</li>`;
    case "blockquote": return `<blockquote>${renderChildren(node, depth)}</blockquote>`;
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" && /^[a-z0-9+#-]{1,20}$/i.test(node.attrs.language) ? node.attrs.language : null;
      const code = (node.content ?? []).map((c) => (typeof c.text === "string" ? c.text : "")).join("");
      return `<pre><code${lang ? ` class="language-${lang}"` : ""}>${escapeHtml(code)}</code></pre>`;
    }
    case "hardBreak": return "<br>";
    case "horizontalRule": return "<hr>";
    default: return ""; // nœud inconnu : supprimé
  }
}

export function tiptapToHtml(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  return renderNode(doc as TipTapNode);
}

/** Texte brut (recherche, extraits, temps de lecture). */
export function tiptapToText(doc: unknown, depth = 0): string {
  if (!doc || typeof doc !== "object" || depth > MAX_DEPTH) return "";
  const n = doc as TipTapNode;
  if (n.type === "text") return n.text ?? "";
  const inner = (n.content ?? []).map((c) => tiptapToText(c, depth + 1)).join(n.type === "doc" ? "\n" : "");
  return ["paragraph", "heading", "listItem", "blockquote", "codeBlock"].includes(n.type) ? `${inner}\n` : inner;
}
