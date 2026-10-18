import { sanitizeHtml } from "@/lib/sanitize";

/**
 * Pure, framework-agnostic helpers for a content editor textarea.
 * Reused by the generic ContentEditor (blog, services, formations, …).
 * The stored format is sanitized HTML (the server re-sanitizes on write).
 */

export interface SelectionEdit {
  value: string;
  selStart: number;
  selEnd: number;
}

/** Wraps the current selection (or caret) with inline tags. */
export function wrapSelection(
  value: string,
  selStart: number,
  selEnd: number,
  before: string,
  after: string,
  placeholder = "",
): SelectionEdit {
  const selected = value.slice(selStart, selEnd) || placeholder;
  const newValue = value.slice(0, selStart) + before + selected + after + value.slice(selEnd);
  const newSelStart = selStart + before.length;
  const newSelEnd = newSelStart + selected.length;
  return { value: newValue, selStart: newSelStart, selEnd: newSelEnd };
}

/** Prefixes each line intersecting the selection (headings, lists). */
export function prefixLines(
  value: string,
  selStart: number,
  selEnd: number,
  prefix: string,
): SelectionEdit {
  const lineStart = value.lastIndexOf("\n", selStart - 1) + 1;
  const before = value.slice(0, lineStart);
  const middle = value.slice(lineStart, selEnd);
  const after = value.slice(selEnd);
  const prefixed = middle
    .split("\n")
    .map((line) => (line.startsWith(prefix) ? line : prefix + line))
    .join("\n");
  const newValue = before + prefixed + after;
  return { value: newValue, selStart: lineStart, selEnd: lineStart + prefixed.length };
}

function selectedLineRange(value: string, selStart: number, selEnd: number) {
  const start = Math.max(0, Math.min(selStart, value.length));
  const end = Math.max(start, Math.min(selEnd, value.length));
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  // A selection ending exactly at the next line's start must not format that
  // otherwise unselected line.
  const effectiveEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextLineBreak = value.indexOf("\n", effectiveEnd);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  return { lineStart, lineEnd };
}

/** Formats every selected/current line as an HTML h2 block. */
export function formatHeadingSelection(
  value: string,
  selStart: number,
  selEnd: number,
): SelectionEdit {
  const { lineStart, lineEnd } = selectedLineRange(value, selStart, selEnd);
  const source = value.slice(lineStart, lineEnd) || "Titre";
  const block = source
    .split("\n")
    .map((line) => `<h2>${line}</h2>`)
    .join("\n");
  return {
    value: value.slice(0, lineStart) + block + value.slice(lineEnd),
    selStart: lineStart,
    selEnd: lineStart + block.length,
  };
}

/** Formats the selected/current lines as one semantic HTML unordered list. */
export function formatUnorderedListSelection(
  value: string,
  selStart: number,
  selEnd: number,
): SelectionEdit {
  const { lineStart, lineEnd } = selectedLineRange(value, selStart, selEnd);
  const source = value.slice(lineStart, lineEnd) || "Élément";
  const items = source
    .split("\n")
    .map((line) => `<li>${line}</li>`)
    .join("\n");
  const block = `<ul>\n${items}\n</ul>`;
  return {
    value: value.slice(0, lineStart) + block + value.slice(lineEnd),
    selStart: lineStart,
    selEnd: lineStart + block.length,
  };
}

/** Inserts a block at the caret, replacing the current selection. */
export function insertAtCaret(
  value: string,
  selStart: number,
  selEnd: number,
  block: string,
): SelectionEdit {
  const newValue = value.slice(0, selStart) + block + value.slice(selEnd);
  const pos = selStart + block.length;
  return { value: newValue, selStart: pos, selEnd: pos };
}

export function buildImageToken(src: string, alt: string): string {
  const safeAlt = alt.trim() || "image";
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(safeAlt)}" loading="lazy" />`;
}

export function buildExternalLinkToken(label: string, href: string): string {
  const safeLabel = label.trim() || href;
  return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(safeLabel)}</a>`;
}

/** Builds an internal link token referencing a resolver target (slug/id). */
export function buildInternalLinkToken(
  label: string,
  href: string,
  title: string | null,
  target: string,
): string {
  const safeLabel = label.trim() || title || href;
  const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
  return `<a href="${escapeAttr(href)}" data-internal-link="${escapeAttr(target)}"${titleAttr}>${escapeHtml(safeLabel)}</a>`;
}

/** Sanitizes untrusted editor HTML for safe live preview rendering. */
export function previewHtml(dirty: string): string {
  return sanitizeHtml(dirty);
}

export interface DeadLinkReport {
  href: string;
  text: string;
  target: string | null;
  reason: "missing-target" | "invalid-url";
}

/**
 * Scans sanitized article HTML for internal links (marked with
 * `data-internal-link`) and reports those whose target is not in `validTargets`.
 * Used by the admin link checker to surface broken internal links after a
 * post has been deleted or its slug changed.
 */
export function detectDeadInternalLinks(html: string, validTargets: Set<string>): DeadLinkReport[] {
  const reports: DeadLinkReport[] = [];
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) !== null) {
    const attrs = match[1];
    const inner = match[2];
    const targetMatch = /\bdata-internal-link="([^"]*)"/i.exec(attrs);
    if (!targetMatch) continue;
    const target = targetMatch[1];
    const hrefMatch = /\bhref="([^"]*)"/i.exec(attrs);
    const href = hrefMatch ? hrefMatch[1] : "";
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (!target) {
      reports.push({ href, text, target: null, reason: "invalid-url" });
      continue;
    }
    if (!validTargets.has(target)) {
      reports.push({ href, text, target, reason: "missing-target" });
    }
  }
  return reports;
}

/**
 * Marks dead internal links in already-sanitized HTML by adding
 * `class="dead-link"` + `data-dead-link` so RichContent can render a warning.
 * `validTargets` is the set of existing target identifiers for the tenant.
 */
export function markDeadInternalLinks(html: string, validTargets: Set<string>): string {
  return html.replace(
    /(<a\b[^>]*\bdata-internal-link=")([^"]*)(")([^>]*>)/gi,
    (full, open, target, close, rest) => {
      if (target && !validTargets.has(target)) {
        const cls = /class="([^"]*)"/i.exec(rest);
        if (cls) {
          return full.replace(cls[0], `class="${cls[1]} dead-link" data-dead-link="true"`);
        }
        return `${open}${target}${close} data-dead-link="true" class="dead-link"${rest}`;
      }
      return full;
    },
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
