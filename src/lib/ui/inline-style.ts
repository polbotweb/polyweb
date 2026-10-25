/**
 * Styles dynamiques compatibles CSP stricte (sans `'unsafe-inline'` ni `'unsafe-hashes'`).
 *
 * Un attribut HTML `style="…"` est bloqué par `style-src` (les hashes ne
 * s'appliquent pas aux attributs). Les composants sérialisent donc leurs
 * déclarations dans `data-style` via `styleAttr()` ; le script
 * `src/scripts/inline-styles.ts` (bundle Astro, donc autorisé par la CSP) les
 * applique par CSSOM (`style.setProperty`), qui n'est pas soumis à `style-src`.
 *
 * Réservé aux valeurs réellement dynamiques (positions aléatoires, index, durées
 * passées en prop). Les valeurs statiques passent par des classes / CSS du composant.
 */

export type StyleValue = string | number | null | undefined | false;
export type StyleMap = Record<string, StyleValue>;

const PROPERTY = /^(--[A-Za-z0-9_-]+|-?[a-z][a-z0-9-]*)$/;
/** Interdit tout ce qui permettrait de sortir de la déclaration (`;`, accolades, balises). */
const UNSAFE_VALUE = /[;{}<>\\]|\/\*/;

function kebab(property: string): string {
  return property.startsWith('--') ? property : property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** `{ width: '4px', '--x': 1 }` → `width:4px;--x:1` (propriétés/valeurs invalides ignorées). */
export function toDeclarations(style: StyleMap): string {
  const out: string[] = [];
  for (const [rawProperty, rawValue] of Object.entries(style)) {
    if (rawValue === null || rawValue === undefined || rawValue === false || rawValue === '') continue;
    const property = kebab(rawProperty);
    const value = String(rawValue).trim();
    if (!PROPERTY.test(property) || UNSAFE_VALUE.test(value)) continue;
    out.push(`${property}:${value}`);
  }
  return out.join(';');
}

/** Attributs à étaler sur l'élément : `<div {...styleAttr({ '--i': index })}>`. */
export function styleAttr(style: StyleMap): { 'data-style'?: string } {
  const declarations = toDeclarations(style);
  return declarations ? { 'data-style': declarations } : {};
}

/** Inverse de `toDeclarations` (côté navigateur) : `[propriété, valeur][]` sûrs. */
export function parseDeclarations(declarations: string): [string, string][] {
  const out: [string, string][] = [];
  for (const part of declarations.split(';')) {
    const i = part.indexOf(':');
    if (i <= 0) continue;
    const property = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (PROPERTY.test(property) && value && !UNSAFE_VALUE.test(value)) out.push([property, value]);
  }
  return out;
}

/**
 * Contenu masqué au rendu (popover, select, menu) : attribut `hidden` côté HTML
 * (aucun flash avant JS) + `display:none` en CSSOM, que les scripts des composants
 * retirent avec `style.removeProperty('display')` à l'ouverture.
 */
export function hiddenUntilScript(style: StyleMap = {}): Record<string, string | boolean> {
  return { hidden: true, 'data-style-hidden': '', ...styleAttr({ display: 'none', ...style }) };
}

/**
 * Variante texte (`"background: red; color: blue"`) pour les aperçus construits par
 * concaténation : mêmes validations que `toDeclarations`.
 */
export function styleText(css: string | null | undefined | false): { 'data-style'?: string } {
  if (!css) return {};
  return styleAttr(Object.fromEntries(parseDeclarations(css)));
}
