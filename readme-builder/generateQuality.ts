import { PATHS, listTree, getScriptsByPrefix } from './utils';
import { i18n, type Lang } from './i18n';
import { promises as fs } from 'fs';

const PIPELINE_DESC: Record<Lang, string> = {
  en: [
    'GitHub Actions pipeline on every push/PR to `main`:',
    '',
    '1. **Lint & Type Check** — ESLint + `astro check` + `pnpm audit`',
    '2. **Unit & Integration** — Vitest + coverage (PostgreSQL 16)',
    '3. **E2E** — Playwright (Chromium + Firefox + WebKit)',
    '4. **Accessibility & Performance** — Pa11y + Lighthouse CI',
    '5. **Build** — production artefact on `main`',
  ].join('\n'),
  fr: [
    "Pipeline GitHub Actions sur chaque push/PR vers `main` :",
    '',
    '1. **Lint & Type Check** — ESLint + `astro check` + `pnpm audit`',
    '2. **Unit & Integration** — Vitest + coverage (PostgreSQL 16)',
    '3. **E2E** — Playwright (Chromium + Firefox + WebKit)',
    '4. **Accessibilité & Performance** — Pa11y + Lighthouse CI',
    '5. **Build** — artefact de production sur `main`',
  ].join('\n'),
  ar: [
    'خط أنابيب GitHub Actions على كل push/PR نحو `main`:',
    '',
    '1. **Lint & Type Check**',
    '2. **Unit & Integration** — Vitest',
    '3. **E2E** — Playwright',
    '4. **Accessibility & Performance** — Pa11y + Lighthouse CI',
    '5. **Build**',
  ].join('\n'),
  es: [
    'Pipeline de GitHub Actions en cada push/PR hacia `main`:',
    '',
    '1. **Lint & Type Check** — ESLint + `astro check` + `pnpm audit`',
    '2. **Unit & Integration** — Vitest + coverage (PostgreSQL 16)',
    '3. **E2E** — Playwright (Chromium + Firefox + WebKit)',
    '4. **Accesibilidad & Performance** — Pa11y + Lighthouse CI',
    '5. **Build**',
  ].join('\n'),
};

const A11Y_DESC: Record<Lang, string> = {
  en: '- **Pa11y** — WCAG AAA compliance\n- **Lighthouse CI** — performance, accessibility, best practices, SEO',
  fr: '- **Pa11y** — conformité WCAG AAA\n- **Lighthouse CI** — performance, accessibilité, bonnes pratiques, SEO',
  ar: '- **Pa11y** — توافق WCAG AAA\n- **Lighthouse CI** — الأداء وإمكانية الوصول والأفضليات و SEO',
  es: '- **Pa11y** — conformidad WCAG AAA\n- **Lighthouse CI** — rendimiento, accesibilidad, buenas prácticas, SEO',
};

export async function generateQuality(lang: Lang): Promise<string> {
  const s = i18n.sections;
  const sub = i18n.subsections;

  let out = `## ${s.quality[lang]}\n\n`;

  // ── Files (exclude reports/ — too many generated files) ─────────────────
  out += `### ${sub.files[lang]}\n\n`;
  out += '```\n';
  // List tests/ top level, excluding the reports/ dir
  try {
    const entries = await fs.readdir(PATHS.tests, { withFileTypes: true });
    out += 'tests/\n';
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'reports') continue;
      out += `  ${e.name}${e.isDirectory() ? '/' : ''}\n`;
    }
  } catch { /* ignore */ }
  const githubTree = await listTree(PATHS.github, 0, 3);
  if (githubTree) out += `.github/\n${githubTree}`;
  out += '```\n\n';

  // ── CI/CD Pipeline ───────────────────────────────────────────────────────
  out += `### ${sub.pipeline[lang]}\n\n${PIPELINE_DESC[lang]}\n\n`;

  // ── Accessibility & Performance ──────────────────────────────────────────
  out += `### ${sub.accessibility[lang]}\n\n${A11Y_DESC[lang]}\n\n`;

  // ── Commands ─────────────────────────────────────────────────────────────
  const commands = await getScriptsByPrefix(['test', 'a11y', 'qa', 'lint', 'check']);
  if (commands) out += `### ${sub.commands[lang]}\n\n${commands}\n\n`;

  return out;
}
