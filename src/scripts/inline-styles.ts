/**
 * Applicateur global des `data-style` (CSP stricte, voir src/lib/ui/inline-style.ts) :
 * au chargement, après chaque navigation Astro et pour les nœuds ajoutés ensuite
 * (clones de templates, rendus côté client).
 */
import { applyInlineStyle, applyInlineStylesWithin } from '@/lib/ui/inline-style-dom';

applyInlineStylesWithin(document);
document.addEventListener('astro:page-load', () => applyInlineStylesWithin(document));

new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === 'attributes' && m.target instanceof Element) applyInlineStyle(m.target, true);
    m.addedNodes.forEach((node) => { if (node instanceof Element) applyInlineStylesWithin(node); });
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-style'] });
