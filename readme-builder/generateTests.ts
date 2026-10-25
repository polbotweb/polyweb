import { readFile, PATHS, listTree } from './utils';
import path from 'path';
import fs from 'fs/promises';
import type { Lang } from './i18n';

function extractTestTitles(content: string) {
  const describes: { title: string; its: string[]; index: number }[] = [];
  const describeRegex = /describe\(\s*(['"`])([\s\S]*?)\1\s*,/g;
  const itRegex = /it\(\s*(['"`])([\s\S]*?)\1\s*,/g;

  const describeMatches = [...content.matchAll(describeRegex)].map(m => ({ index: m.index || 0, title: m[2].trim() }));
  const itMatches = [...content.matchAll(itRegex)].map(m => ({ index: m.index || 0, title: m[2].trim() }));

  if (describeMatches.length === 0) {
    // fallback: list top-level 'it' only
    const its = itMatches.map(i => i.title);
    if (its.length) return [{ title: 'Tests', its, index: 0 }];
    return [];
  }

  for (let i = 0; i < describeMatches.length; i++) {
    const d = describeMatches[i];
    const nextIndex = i + 1 < describeMatches.length ? describeMatches[i + 1].index : content.length;
    // its that are between d.index and nextIndex
    const localIts = itMatches.filter(im => im.index > d.index && im.index < nextIndex).map(im => ({ index: im.index, title: im.title }));
    // Exclude its that are actually inside a nested describe: if there's any describe j with index > d.index and < it.index, then that it belongs to nested describe
    const filteredIts = localIts.filter(it => !describeMatches.some(dm => dm.index > d.index && dm.index < it.index));
    describes.push({ title: d.title, its: filteredIts.map(x => x.title), index: d.index });
  }

  return describes;
}

import type { Dirent } from 'fs';

async function findTestFiles(root: string) {
  const results: string[] = [];
  async function walk(dir: string) {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(e.name)) results.push(full);
    }
  }
  await walk(root);
  return results;
}

export async function generateTests(lang: Lang, t: any): Promise<string> {
  const lines: string[] = [];

  // Heading (no leading/trailing blank lines; parent caller controls spacing)
  lines.push(`## ${t.sections.tests[lang]}`);
  lines.push('');

  if (t.testsIntro) {
    lines.push(t.testsIntro[lang]);
    lines.push('');
  }

  // Recommended files tree (tests/ + src tests)
  lines.push('### Recommended test configs and files');
  lines.push('');

  const testsTree = await listTree(PATHS.root + '/tests');
  if (testsTree) {
    lines.push(testsTree.trim());
  }

  // Also include test files under src (lib/db/pages/api)
  const srcSections = ['src/lib', 'src/database', 'src/pages/api'];
  for (const section of srcSections) {
    const full = path.join(PATHS.root, section);
    const tree = await listTree(full);
    if (tree) {
      lines.push(`- **${section}**`);
      lines.push(tree.trim());
    }
  }

  lines.push('');

  // Summaries: extract describe/it from each test file found
  lines.push('#### Test file summaries');
  lines.push('');

  const testFiles = new Set<string>();
  // gather from tests folder
  const filesInTests = await findTestFiles(PATHS.root + '/tests');
  filesInTests.forEach(f => testFiles.add(path.relative(PATHS.root, f)));
  // gather from src
  const filesInSrc = await findTestFiles(PATHS.root + '/src');
  filesInSrc.forEach(f => testFiles.add(path.relative(PATHS.root, f)));

  if (testFiles.size === 0) {
    return '_No test files found_';
  }

  for (const f of Array.from(testFiles).sort()) {
    lines.push('- `' + f + '`');
    try {
      const content = await readFile(path.join(PATHS.root, f));
      const describes = extractTestTitles(content);
      for (const d of describes) {
        lines.push(`  - **${d.title}**`);
        for (const it of d.its) {
          // Format emails and URLs with < > for Markdown compliance (MD034/no-bare-urls)
          let formatted = it.replace(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '<$1>');
          formatted = formatted.replace(/\bhttps?:\/\/[^\s)]+/g, match => `<${match}>`);
          lines.push(`    - ${formatted}`);
        }
      }
    } catch (err) {
      // ignore read errors
    }
    lines.push('');
  }

  // Normalize internal spacing and trim leading/trailing blank lines
  let out = lines.join('\n');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}
