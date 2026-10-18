/**
 * Post-processing script: renames LHCI report files from timestamps
 * to human-readable names based on the page URL.
 *
 * Example: lhr-1773479276175.html → fr--home.html
 *          lhr-1773479490151.html → ar--auth--تسجيل-الدخول.html
 *
 * Arabic (and other non-ASCII) slugs are kept as-is after percent-decoding,
 * but characters unsafe for filenames are stripped.
 */

const fs = require('node:fs');
const path = require('node:path');

const LH_DIR = path.resolve(__dirname, '../../.lighthouseci');

if (!fs.existsSync(LH_DIR)) {
  console.log('No .lighthouseci directory found, nothing to rename.');
  process.exit(0);
}

const jsonFiles = fs.readdirSync(LH_DIR).filter((f) => f.startsWith('lhr-') && f.endsWith('.json'));

if (!jsonFiles.length) {
  console.log('No lhr-*.json files found.');
  process.exit(0);
}

/** Convert a URL to a filesystem-safe name */
function urlToName(url) {
  try {
    const u = new URL(url);
    // pathname like /fr/ or /en/auth/sign-in or /ar/من-نحن
    let p = decodeURIComponent(u.pathname);
    // Remove leading/trailing slashes
    p = p.replace(/^\/|\/$/g, '');
    if (!p) return 'root';
    // Replace / with -- for readability
    p = p.replace(/\//g, '--');
    // Handle trailing empty segment (homepage): "fr" → "fr--home"
    if (!p.includes('--')) p += '--home';
    // Remove characters unsafe for filenames (Windows: <>:"/\|?* and control chars)
    p = p.replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
    return p;
  } catch {
    return 'unknown';
  }
}

const seen = new Map();
let renamed = 0;

for (const jsonFile of jsonFiles) {
  const jsonPath = path.join(LH_DIR, jsonFile);
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const url = data.requestedUrl || data.finalUrl || '';
  let baseName = urlToName(url);

  // Handle duplicates (shouldn't happen with numberOfRuns=1, but just in case)
  const count = seen.get(baseName) || 0;
  seen.set(baseName, count + 1);
  if (count > 0) baseName += `-${count + 1}`;

  const timestamp = jsonFile.replace('lhr-', '').replace('.json', '');

  // Rename JSON
  const newJson = `${baseName}.json`;
  fs.renameSync(jsonPath, path.join(LH_DIR, newJson));

  // Rename HTML if it exists
  const htmlFile = `lhr-${timestamp}.html`;
  const htmlPath = path.join(LH_DIR, htmlFile);
  if (fs.existsSync(htmlPath)) {
    const newHtml = `${baseName}.html`;
    fs.renameSync(htmlPath, path.join(LH_DIR, newHtml));
  }

  console.log(`  ${jsonFile} → ${newJson} (${url})`);
  renamed++;
}

console.log(`\nRenamed ${renamed} report(s).`);
