import { PATHS, listTree, claimTestsByPattern } from './utils';
import { i18n, type Lang } from './i18n';

const ROUTING_DESC: Record<Lang, string> = {
  en: 'All routes are prefixed with the locale: `/fr/`, `/en/`, `/es/`, `/ar/`. Default locale is `fr`.',
  fr: 'Toutes les routes sont préfixées par la locale : `/fr/`, `/en/`, `/es/`, `/ar/`. La locale par défaut est `fr`.',
  ar: 'جميع المسارات مسبوقة بالإعداد المحلي: `/fr/`، `/en/`، `/es/`، `/ar/`. الإعداد المحلي الافتراضي هو `fr`.',
  es: 'Todas las rutas llevan el prefijo de la locale: `/fr/`, `/en/`, `/es/`, `/ar/`. La locale por defecto es `fr`.',
};

export async function generateI18n(lang: Lang, assigned: Set<string> = new Set()): Promise<string> {
  const s = i18n.sections;
  const sub = i18n.subsections;

  let out = `## ${s.i18nSection[lang]}\n\n`;

  // ── Files ────────────────────────────────────────────────────────────────
  out += `### ${sub.files[lang]}\n\n`;
  out += '```\n';
  const i18nTree = await listTree(PATHS.i18nDir);
  if (i18nTree) out += `src/i18n/\n${i18nTree}`;
  out += '```\n\n';

  // ── Supported Locales ────────────────────────────────────────────────────
  out += `### ${sub.locales[lang]}\n\n`;
  out += '| Locale | Language | Direction |\n|--------|----------|-----------|\n';
  out += '| `fr` | Français (default) | LTR |\n';
  out += '| `en` | English | LTR |\n';
  out += '| `es` | Español | LTR |\n';
  out += '| `ar` | العربية | RTL |\n\n';

  // ── Routing ──────────────────────────────────────────────────────────────
  out += `### ${sub.routing[lang]}\n\n${ROUTING_DESC[lang]}\n\n`;

  // ── Tests ────────────────────────────────────────────────────────────────
  const testFiles = await claimTestsByPattern(['i18n', 'cms-i18n'], assigned);
  if (testFiles.length > 0) {
    out += `### ${sub.tests[lang]}\n\n`;
    for (const f of testFiles) out += `- \`${f}\`\n`;
    out += '\n';
  }

  return out;
}
