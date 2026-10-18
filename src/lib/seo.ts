/**
 * SEO validation helper for CMS pages.
 * Used by admin UI and API to provide real-time SEO guidance.
 */

export type SeoSeverity = 'error' | 'warning' | 'info';

export interface SeoIssue {
  field: string;
  severity: SeoSeverity;
  message: string;
}

/**
 * Validate SEO fields for a CMS page.
 * Returns a list of issues sorted by severity (error → warning → info).
 *
 * Optionally accepts `sections` to detect structural SEO problems
 * (e.g. multiple h1 headings from hero sections).
 */
export function validatePageSeo(page: {
  title?: string;
  slug?: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImage?: string | null;
  canonical?: string | null;
  robots?: string | null;
}, sections?: { type: string }[]): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const displayTitle = page.metaTitle || page.title || '';

  // ── Title ────────────────────────────────────────────────────────
  if (!displayTitle) {
    issues.push({ field: 'title', severity: 'error', message: 'Aucun titre défini.' });
  } else {
    if (displayTitle.length < 10) {
      issues.push({ field: 'title', severity: 'warning', message: `Titre trop court (${displayTitle.length}/10 min). Visez 10-60 caractères.` });
    }
    if (displayTitle.length > 60) {
      issues.push({ field: 'title', severity: 'warning', message: `Titre trop long (${displayTitle.length}/60 max). Risque de troncature dans les SERP.` });
    }
  }

  // ── Meta Description ─────────────────────────────────────────────
  if (!page.metaDescription) {
    issues.push({ field: 'metaDescription', severity: 'error', message: 'Meta description manquante. Essentielle pour le référencement.' });
  } else {
    if (page.metaDescription.length < 50) {
      issues.push({ field: 'metaDescription', severity: 'warning', message: `Meta description trop courte (${page.metaDescription.length}/50 min). Visez 50-160 caractères.` });
    }
    if (page.metaDescription.length > 160) {
      issues.push({ field: 'metaDescription', severity: 'warning', message: `Meta description trop longue (${page.metaDescription.length}/160 max). Sera tronquée.` });
    }
  }

  // ── OG Image ─────────────────────────────────────────────────────
  if (!page.ogImage) {
    issues.push({ field: 'ogImage', severity: 'info', message: 'Image OG non définie. Recommandé pour les partages sociaux.' });
  }

  // ── Canonical ────────────────────────────────────────────────────
  if (page.canonical) {
    if (!/^https?:\/\/.+/.test(page.canonical)) {
      issues.push({ field: 'canonical', severity: 'error', message: 'L\'URL canonique doit être une URL absolue (http:// ou https://).' });
    }
  }

  // ── Robots ───────────────────────────────────────────────────────
  if (page.robots) {
    const VALID_DIRECTIVES = new Set([
      'index', 'noindex', 'follow', 'nofollow', 'none', 'all',
      'noarchive', 'nosnippet', 'noimageindex', 'max-snippet',
      'max-image-preview', 'max-video-preview'
    ]);
    const PARAM_DIRECTIVES = new Set(['max-snippet', 'max-image-preview', 'max-video-preview']);
    const VALID_IMAGE_PREVIEW = new Set(['none', 'standard', 'large']);

    const rawDirectives = page.robots.split(',').map(d => d.trim());
    for (const raw of rawDirectives) {
      if (!raw) continue;
      const [name, param] = raw.split(':').map(s => s.trim().toLowerCase());
      if (!VALID_DIRECTIVES.has(name)) {
        issues.push({ field: 'robots', severity: 'warning', message: `Directive robots inconnue : « ${name} ». Vérifiez la syntaxe.` });
        continue;
      }
      if (PARAM_DIRECTIVES.has(name)) {
        if (name === 'max-image-preview') {
          if (!param || !VALID_IMAGE_PREVIEW.has(param)) {
            issues.push({ field: 'robots', severity: 'warning', message: `Valeur invalide pour max-image-preview : « ${param ?? ''} ». Utilisez none, standard ou large.` });
          }
        } else {
          // max-snippet, max-video-preview accept integer values
          if (param === undefined || isNaN(Number(param))) {
            issues.push({ field: 'robots', severity: 'warning', message: `Valeur numérique requise pour ${name}.` });
          }
        }
      }
    }
    const directives = rawDirectives.map(d => d.split(':')[0].trim().toLowerCase());
    if (directives.includes('noindex')) {
      issues.push({ field: 'robots', severity: 'info', message: 'La page est marquée noindex — elle ne sera pas indexée par les moteurs de recherche.' });
    }
  }

  // ── Slug ──────────────────────────────────────────────────────────
  if (page.slug) {
    if (page.slug.length > 50) {
      issues.push({ field: 'slug', severity: 'warning', message: `Slug long (${page.slug.length} car.). Les URLs courtes sont préférées pour le SEO.` });
    }
    if (page.slug.includes('--')) {
      issues.push({ field: 'slug', severity: 'info', message: 'Le slug contient des tirets doubles. Simplifiez pour une meilleure lisibilité.' });
    }
  }

  // ── Meta Title vs Title ──────────────────────────────────────────
  if (page.metaTitle && page.title && page.metaTitle === page.title) {
    issues.push({ field: 'metaTitle', severity: 'info', message: 'Le meta title est identique au titre. Personnalisez-le pour optimiser le CTR.' });
  }

  // ── Duplicate <h1> detection ─────────────────────────────────────
  if (sections) {
    const heroCount = sections.filter(s => s.type === 'hero').length;
    if (heroCount > 1) {
      issues.push({ field: 'sections', severity: 'warning', message: `${heroCount} sections hero détectées. Une seule balise <h1> par page est recommandée pour le SEO.` });
    }
  }

  // Sort by severity: error > warning > info
  const order: Record<SeoSeverity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * Compute an SEO score (0-100) from issues.
 */
export function computeSeoScore(issues: SeoIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'error') score -= 25;
    else if (issue.severity === 'warning') score -= 10;
    else score -= 3;
  }
  return Math.max(0, Math.min(100, score));
}
