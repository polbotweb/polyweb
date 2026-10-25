/**
 * Application navigateur des `data-style` (voir ./inline-style.ts), partagée par
 * l'applicateur global (src/scripts/inline-styles.ts) et les scripts de composants
 * qui doivent lire leur style avant d'agir (popover, select, menu, dialog) :
 * l'ordre d'exécution des modules n'a donc pas d'importance.
 *
 * Chaque élément n'est appliqué qu'une fois (sauf `force`, quand son `data-style`
 * change) : un script qui a déjà ajusté `el.style` n'est pas écrasé.
 * `data-style-hidden` : après application (qui pose `display:none`), l'attribut
 * `hidden` du rendu serveur est retiré pour rendre la main au script du composant.
 */
import { parseDeclarations } from './inline-style';

const applied = new WeakSet<Element>();

export function applyInlineStyle(el: Element, force = false): void {
  if (!force && applied.has(el)) return;
  const declarations = el.getAttribute('data-style');
  if (!declarations || !(el instanceof HTMLElement || el instanceof SVGElement)) return;
  for (const [property, value] of parseDeclarations(declarations)) el.style.setProperty(property, value);
  applied.add(el);
  if (el.hasAttribute('data-style-hidden')) {
    el.removeAttribute('data-style-hidden');
    el.removeAttribute('hidden');
  }
}

export function applyInlineStylesWithin(root: ParentNode): void {
  if (root instanceof Element && root.hasAttribute('data-style')) applyInlineStyle(root);
  root.querySelectorAll('[data-style]').forEach((el) => applyInlineStyle(el));
}
