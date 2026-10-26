/**
 * Coque HTML autonome des documents imprimables : `lang`/`dir` (RTL pour l'arabe), CSP qui
 * interdit toute ressource distante (styles inline, images / polices en `data:` seulement),
 * aucune exécution de script. Les polices sont celles installées localement.
 */
import type { Locale } from "@i18n/config";
import { getDirection } from "@i18n/utils";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Échappe une valeur texte pour l'insérer dans le HTML (contenu ou attribut). */
export const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

/** CSP du document imprimé : rien ne sort de la page. */
export const PRINT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";

export interface PrintDocumentShell {
  readonly locale: Locale;
  readonly title: string;
  /** CSS supplémentaire (thème actif, styles du document). Ne doit contenir aucune `url()` distante. */
  readonly css?: string;
  /** Corps HTML déjà échappé. */
  readonly body: string;
}

/** Retire les `url()` non `data:` (et les `@import`) du CSS injecté : aucune requête réseau possible. */
export const sanitizePrintCss = (css: string) =>
  css.replace(/@import[^;]*;/gi, "").replace(/url\(\s*(['"]?)(?!data:)[^)]*\)/gi, "none");

export const BASE_PRINT_CSS = `
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
html { font-family: system-ui, "Noto Sans", "Noto Sans Arabic", "DejaVu Sans", sans-serif; font-size: 11pt; color: #111; }
body { margin: 0; }
h1 { font-size: 18pt; margin: 0 0 4mm; }
h2 { font-size: 12pt; margin: 6mm 0 2mm; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 1.5mm 2mm; border-bottom: 0.3mm solid #ccc; text-align: start; vertical-align: top; }
th { background: var(--muted, #f3f3f3); }
.num { text-align: end; font-variant-numeric: tabular-nums; }
.grid { display: flex; justify-content: space-between; gap: 8mm; }
.muted { color: #555; }
.accent { border-top: 1.2mm solid var(--primary, #333); padding-top: 3mm; }
.totals { margin-inline-start: auto; width: 50%; }
`;

/** Document HTML complet, prêt pour le moteur PDF. */
export function printDocument({ locale, title, css = "", body }: PrintDocumentShell): string {
  const dir = getDirection(locale);
  return `<!doctype html><html lang="${escapeHtml(locale)}" dir="${dir}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PRINT_CSP}"><title>${escapeHtml(title)}</title><style>${BASE_PRINT_CSS}${sanitizePrintCss(css)}</style></head><body>${body}</body></html>`;
}
