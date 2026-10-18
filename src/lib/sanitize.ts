import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p", "b", "i", "u", "strong", "em", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "img", "br", "hr",
  "table", "thead", "tbody", "tr", "th", "td",
  "code", "pre", "span", "div",
  "figure", "figcaption", "sub", "sup", "mark", "small",
];

const ALLOWED_ATTR = [
  "href", "src", "alt", "title", "class",
  "target", "rel", "width", "height",
  "colspan", "rowspan", "loading",
  "id", "data-internal-link",
];

const SAFE_URL_PROTOCOLS = /^(https?:\/\/|mailto:|tel:|\/(?!\/)).+/;
const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
const CONTROLLED_HEADING_ID = /^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,127}$/u;
const CONTROLLED_INTERNAL_TARGET = /^[\p{L}\p{N}][\p{L}\p{N}._:/-]{0,255}$/u;

/** Validates a URL for use in <a href>. Blocks javascript:, data:, vbscript: etc. */
export function safeUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  return SAFE_URL_PROTOCOLS.test(trimmed) ? trimmed : '';
}

/** Validates a URL for use in <iframe src>. Only allows https:// origins. */
export function safeEmbedUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  return trimmed.startsWith('https://') ? trimmed : '';
}

/**
 * Escapes a pre-serialized JSON string for safe embedding inside a
 * `<script type="application/ld+json">` element via `set:html`.
 *
 * `JSON.stringify()` alone does NOT escape `<`, so a JSON-LD payload built
 * from CMS/user content (e.g. a blog post title or FAQ answer containing the
 * literal text `</script>`) can prematurely close the script tag and inject
 * arbitrary markup — the browser's HTML tokenizer looks for that byte
 * sequence regardless of JSON string-escaping. Replacing every `<` with its
 * unicode escape neutralizes `</script>`, `<!--` and any other tag-like
 * sequence while remaining valid, semantically identical JSON.
 */
export function safeJsonLd(json: string): string {
  return json.replace(/</g, '\\u003c');
}

const MAX_SANITIZE_LENGTH = 500_000; // 500 KB

// Force rel="noopener noreferrer" on any anchor that opens a new tab, to
// prevent reverse-tabnabbing (window.opener) from user-authored content.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
    node.setAttribute("rel", "noopener noreferrer");
  }
});

// DOMPurify's attribute allowlist is global. Restrict these two editor
// attributes to their intended elements and controlled values rather than
// broadly enabling ids or arbitrary data-* attributes on authored content.
DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
  if (data.attrName === "id") {
    data.keepAttr =
      HEADING_TAGS.has(node.nodeName.toUpperCase()) &&
      CONTROLLED_HEADING_ID.test(data.attrValue);
  }
  if (data.attrName === "data-internal-link") {
    data.keepAttr =
      node.nodeName.toUpperCase() === "A" &&
      (data.attrValue === "" || CONTROLLED_INTERNAL_TARGET.test(data.attrValue));
  }
});

export function sanitizeHtml(dirty: unknown): string {
  if (typeof dirty !== "string") return "";
  if (dirty.length > MAX_SANITIZE_LENGTH) {
    throw new Error(`Contenu HTML trop volumineux (${(dirty.length / 1024).toFixed(0)} KB). Maximum : ${(MAX_SANITIZE_LENGTH / 1024).toFixed(0)} KB.`);
  }
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}
