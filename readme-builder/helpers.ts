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
