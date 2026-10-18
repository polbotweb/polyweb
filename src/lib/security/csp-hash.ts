import { createHash } from 'node:crypto';

/**
 * Empreinte CSP (`sha256-<base64>`) d'un contenu inline (élément `<style>` ou `<script>`).
 * Doit porter sur le texte exact inséré dans la page (sans balises).
 */
export function cspSha256(content: string): `sha256-${string}` {
  return `sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}`;
}

/**
 * Autorise un élément `<style>` inline généré dynamiquement (ex. CSS du thème actif) :
 * Astro ne hache que les styles qu'il connaît au build, les `<style set:html>` doivent
 * être déclarés sur la requête, sinon `style-src` bloque l'élément.
 * `csp` est `Astro.csp` (absent quand la CSP est désactivée, ex. en dev).
 */
export function allowInlineStyle(
  csp: { insertStyleHash: (hash: `sha256-${string}`) => void } | undefined,
  content: string,
): void {
  if (content) csp?.insertStyleHash(cspSha256(content));
}
