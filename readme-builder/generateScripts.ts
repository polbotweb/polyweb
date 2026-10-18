import { PATHS, readFile } from './utils';

export async function generateScripts(): Promise<string> {
  // Use lang and t for future localization
  let out = '';
  const pkgContent = await readFile(PATHS.packageJson);
  if (!pkgContent) return out;
  const pkg = JSON.parse(pkgContent);
  const scripts = Object.entries(pkg.scripts || {})
    .map(([name, cmd]) => `- \`npm run ${name}\`: ${cmd}`)
    .join('\n');
  // Example: if (lang === 'fr') { ... } for French output
  // Example: use t for translation
  out += scripts ? scripts + '\n' : '_None_\n';
  return out;
}
