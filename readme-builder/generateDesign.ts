import { PATHS, listTree, readFile, claimTestsByPattern } from './utils';
import { i18n, type Lang } from './i18n';
import path from 'path';
import { promises as fs } from 'fs';

export async function generateDesign(lang: Lang, assigned: Set<string> = new Set()): Promise<string> {
  const s = i18n.sections;
  const sub = i18n.subsections;

  let out = `## ${s.design[lang]}\n\n`;

  // ── Files (depth 1 = show component groups only, no individual files) ─────
  out += `### ${sub.files[lang]}\n\n`;
  out += '```\n';
  const compTree = await listTree(PATHS.components, 0, 1);
  if (compTree) out += `src/components/\n${compTree}`;
  const stylesTree = await listTree(PATHS.styles);
  if (stylesTree) out += `src/styles/\n${stylesTree}`;
  const assetsTree = await listTree(PATHS.assets, 0, 1);
  if (assetsTree) out += `src/assets/\n${assetsTree}`;
  out += '```\n\n';

  // ── Components (count subdirs = 1 component per folder) ──────────────────
  out += `### ${sub.components[lang]}\n\n`;
  const groups = ['atoms', 'molecules', 'organisms', 'pages', 'wow'];
  for (const dir of groups) {
    try {
      const entries = await fs.readdir(path.join(PATHS.components, dir), { withFileTypes: true });
      const count = entries.filter(e => !e.name.startsWith('.')).length;
      out += `- **${dir}/** — ${count} component${count !== 1 ? 's' : ''}\n`;
    } catch { /* directory may not exist */ }
  }
  out += '\n';

  // ── Styles & Tokens ──────────────────────────────────────────────────────
  out += `### ${sub.stylesTokens[lang]}\n\n`;
  const globalCss = await readFile(path.join(PATHS.styles, 'global.css'));
  if (globalCss) {
    const cssVars = globalCss.match(/--[a-zA-Z0-9-]+:/g);
    if (cssVars) {
      const unique = [...new Set(cssVars.map(v => v.replace(':', '')))];
      out += `\`global.css\` — ${unique.length} CSS custom properties\n\n`;
      out += '```css\n';
      const sample = unique.slice(0, 6);
      for (const v of sample) {
        const line = globalCss.split('\n').find(l => l.includes(v + ':'));
        if (line) out += line.trim() + '\n';
      }
      if (unique.length > 6) out += `/* ... ${unique.length - 6} more */\n`;
      out += '```\n\n';
    }
  }

  // ── Tests ────────────────────────────────────────────────────────────────
  const testFiles = await claimTestsByPattern([
    'theme-tokens', 'section-schemas', 'section-content', 'sections-sanitize', 'seo', 'sanitize',
  ], assigned);
  if (testFiles.length > 0) {
    out += `### ${sub.tests[lang]}\n\n`;
    for (const f of testFiles) out += `- \`${f}\`\n`;
    out += '\n';
  }

  return out;
}
