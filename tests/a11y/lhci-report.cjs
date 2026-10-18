/**
 * Lighthouse report analysis — reads all JSON reports from .lighthouseci/
 * and outputs a detailed summary with scores and Core Web Vitals.
 *
 * Usage:  node tests/a11y/lhci-report.cjs
 *         node tests/a11y/lhci-report.cjs --contrast   (show color-contrast details)
 */

const fs = require('node:fs');
const path = require('node:path');

const LH_DIR = path.resolve(__dirname, '../../.lighthouseci');
const showContrast = process.argv.includes('--contrast');

if (!fs.existsSync(LH_DIR)) {
  console.log('No .lighthouseci directory found. Run Lighthouse first.');
  process.exit(0);
}

const files = fs.readdirSync(LH_DIR).filter(f => f.endsWith('.json')).sort();
if (!files.length) {
  console.log('No JSON reports found.');
  process.exit(0);
}

let total = 0;
let perfPass = 0;
const perfFails = [];
const a11yFails = [];
const contrastDetails = [];
let bpPass = 0;
let seoPass = 0;

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('  LIGHTHOUSE REPORT ANALYSIS');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('');
console.log(
  'Page'.padEnd(42) +
  'Perf  A11y  BP    SEO   ' +
  'LCP     SI      TBT     CLS'
);
console.log('─'.repeat(110));

files.forEach(f => {
  const r = JSON.parse(fs.readFileSync(path.join(LH_DIR, f), 'utf8'));
  if (!r.categories) return;
  total++;

  const p = r.categories.performance.score * 100;
  const a = r.categories.accessibility.score * 100;
  const bp = r.categories['best-practices'].score * 100;
  const s = r.categories.seo.score * 100;

  if (p >= 90) perfPass++;
  else perfFails.push({ page: f.replace('.json', ''), score: p });

  if (a < 90) a11yFails.push({ page: f.replace('.json', ''), score: a });

  if (bp >= 90) bpPass++;
  if (s >= 90) seoPass++;

  const lcp = r.audits['largest-contentful-paint']?.numericValue;
  const si = r.audits['speed-index']?.numericValue;
  const tbt = r.audits['total-blocking-time']?.numericValue;
  const cls = r.audits['cumulative-layout-shift']?.numericValue;

  const name = f.replace('.json', '');
  console.log(
    name.padEnd(42) +
    String(p).padEnd(6) +
    String(a).padEnd(6) +
    String(bp).padEnd(6) +
    String(s).padEnd(6) +
    (lcp ? (lcp / 1000).toFixed(1) + 's' : 'N/A').padEnd(8) +
    (si ? (si / 1000).toFixed(1) + 's' : 'N/A').padEnd(8) +
    (tbt !== undefined ? Math.round(tbt) + 'ms' : 'N/A').padEnd(8) +
    (cls !== undefined ? cls.toFixed(3) : 'N/A')
  );

  // Collect color-contrast failures
  if (showContrast) {
    const cc = r.audits['color-contrast'];
    if (cc && cc.score === 0 && cc.details && cc.details.items) {
      cc.details.items.forEach(item => {
        contrastDetails.push({
          page: name,
          snippet: item.node?.snippet,
          selector: item.node?.selector,
          explanation: item.node?.explanation,
        });
      });
    }
  }
});

const a11yPass = total - a11yFails.length;

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('');
console.log(`  Total pages audited:  ${total}`);
console.log(`  Performance >=90:     ${perfPass}/${total}  ${perfPass === total ? '✅' : '⚠️'}`);
console.log(`  Accessibility >=90:   ${a11yPass}/${total}  ${a11yPass === total ? '✅' : '⚠️'}`);
console.log(`  Best Practices >=90:  ${bpPass}/${total}  ${bpPass === total ? '✅' : '⚠️'}`);
console.log(`  SEO >=90:             ${seoPass}/${total}  ${seoPass === total ? '✅' : '⚠️'}`);

if (perfFails.length) {
  console.log('');
  console.log('  Performance failures (<90):');
  perfFails.forEach(x => console.log(`    ❌ ${x.page} — ${x.score}`));
}

if (a11yFails.length) {
  console.log('');
  console.log('  Accessibility failures (<90):');
  a11yFails.forEach(x => console.log(`    ❌ ${x.page} — ${x.score}`));
}

if (showContrast && contrastDetails.length) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('  COLOR-CONTRAST DETAILS');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  contrastDetails.forEach(d => {
    console.log('');
    console.log(`  Page:     ${d.page}`);
    console.log(`  Element:  ${d.snippet}`);
    console.log(`  Selector: ${d.selector}`);
    console.log(`  Issue:    ${d.explanation}`);
  });
}

console.log('');
