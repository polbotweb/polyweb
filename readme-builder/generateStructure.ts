import { PATHS, listTree } from './utils';

export async function generateStructure(lang: string, t: any): Promise<string> {
  let out = `## ${t.sections.structure[lang]}\n\n`;
  out += '```text\n';
  out += await listTree(PATHS.root);
  out += '```\n\n';
  return out;
}
