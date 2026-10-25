import type { Lang } from './i18n';
import { LANGS } from './i18n';

/**
 * Génère un slug d'ancre compatible GitHub
 * Accents conservés, ponctuation retirée sauf tirets, espaces → tirets, minuscules
 */
export function githubSlug(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[!"#$%&'()*+,./:;<=>?@\[\]^_`{|}~]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Génère les liens de sélection de langue pour le README
 */
export function getLangLinks(currentLang: Lang): string {
  const links = LANGS.map(lang => {
    const suffix = lang === 'en' ? '' : `.${lang}`;
    const label = lang === currentLang ? `**${lang.toUpperCase()}**` : lang.toUpperCase();
    return `[${label}](./README${suffix}.md)`;
  });
  return links.join(' | ');
}

/** Repli historique si package.json n'a pas de contrainte `engines.node` exploitable. */
export const DEFAULT_NODE_REQUIREMENT = '>= 22.12.0';

/**
 * Prérequis Node affiché dans les READMEs, dérivé de `engines.node` (source unique de vérité) :
 * `">=22.23.4"` → `">= 22.23.4"`. Toute autre forme est reprise telle quelle ; absente → repli.
 */
export function formatNodeRequirement(engine: unknown): string {
  if (typeof engine !== 'string' || !engine.trim()) return DEFAULT_NODE_REQUIREMENT;
  const range = engine.trim();
  const min = /^>=\s*(\d+(?:\.\d+){0,2})$/.exec(range);
  return min ? `>= ${min[1]}` : range;
}
