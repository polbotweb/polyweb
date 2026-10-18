/**
 * Generate a human-readable text report from Lighthouse CI JSON results.
 *
 * Usage: node tests/helpers/lighthouse-report.cjs
 *
 * Reads all JSON reports from .lighthouseci/ (produced by lhci autorun)
 * and writes tests/reports/lighthouse-report.txt with a formatted summary.
 *
 * Also copies the JSON+HTML files to tests/reports/lighthouse/ for archiving.
 */

const fs = require('node:fs');
const path = require('node:path');

const LH_DIR = path.resolve(__dirname, '../../.lighthouseci');
const REPORTS_DIR = path.resolve(__dirname, '../reports');
const DEST_DIR = path.join(REPORTS_DIR, 'lighthouse');
const TEXT_PATH = path.join(REPORTS_DIR, 'lighthouse-report.txt');

// ── Thresholds (match lighthouserc.cjs assertions) ───────────────────

const THRESHOLDS = {
  performance: 90,
  accessibility: 90,
  'best-practices': 90,
  seo: 90,
};

const CWV_THRESHOLDS = {
  lcp: { good: 2500, poor: 4000, unit: 'ms', label: 'Largest Contentful Paint' },
  fcp: { good: 1800, poor: 3000, unit: 'ms', label: 'First Contentful Paint' },
  si: { good: 3400, poor: 5800, unit: 'ms', label: 'Speed Index' },
  tbt: { good: 200, poor: 600, unit: 'ms', label: 'Total Blocking Time' },
  cls: { good: 0.1, poor: 0.25, unit: '', label: 'Cumulative Layout Shift' },
};

// ── Main ─────────────────────────────────────────────────────────────

if (!fs.existsSync(LH_DIR)) {
  console.log('No .lighthouseci directory found. Run Lighthouse first.');
  process.exit(0);
}

const jsonFiles = fs.readdirSync(LH_DIR).filter(f => f.endsWith('.json')).sort();
if (!jsonFiles.length) {
  console.log('No JSON reports found in .lighthouseci/.');
  process.exit(0);
}

// Ensure output dirs
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
if (!fs.existsSync(DEST_DIR)) fs.mkdirSync(DEST_DIR, { recursive: true });

// Copy all JSON + HTML files to tests/reports/lighthouse/
const allFiles = fs.readdirSync(LH_DIR).filter(f => f.endsWith('.json') || f.endsWith('.html'));
for (const f of allFiles) {
  fs.copyFileSync(path.join(LH_DIR, f), path.join(DEST_DIR, f));
}

// ── Parse reports ────────────────────────────────────────────────────

const pages = [];
for (const f of jsonFiles) {
  let r;
  try { r = JSON.parse(fs.readFileSync(path.join(LH_DIR, f), 'utf8')); } catch { continue; }
  if (!r.categories) continue;

  const name = f.replace('.json', '');
  const scores = {};
  for (const [key, cat] of Object.entries(r.categories)) {
    scores[key] = Math.round(cat.score * 100);
  }

  const cwv = {
    lcp: r.audits['largest-contentful-paint']?.numericValue,
    fcp: r.audits['first-contentful-paint']?.numericValue,
    si: r.audits['speed-index']?.numericValue,
    tbt: r.audits['total-blocking-time']?.numericValue,
    cls: r.audits['cumulative-layout-shift']?.numericValue,
  };

  // Collect failed audits (score < 1 and not null, excluding informative/manual)
  const failedAudits = [];
  for (const [key, audit] of Object.entries(r.audits)) {
    if (audit.score === null || audit.score === undefined) continue;
    if (audit.score >= 0.9) continue;
    if (audit.scoreDisplayMode === 'informative' || audit.scoreDisplayMode === 'manual') continue;
    // Skip "insight" audits (diagnostic, not actionable scores)
    if (key.endsWith('-insight')) continue;
    failedAudits.push({
      id: key,
      title: audit.title,
      score: Math.round(audit.score * 100),
      displayValue: audit.displayValue || '',
    });
  }
  failedAudits.sort((a, b) => a.score - b.score);

  // Collect a11y issues
  const a11yIssues = [];
  const a11yCat = r.categories.accessibility;
  if (a11yCat && a11yCat.auditRefs) {
    for (const ref of a11yCat.auditRefs) {
      const audit = r.audits[ref.id];
      if (!audit || audit.score === null || audit.score === 1) continue;
      if (audit.score === 0 && audit.details?.items?.length) {
        for (const item of audit.details.items) {
          a11yIssues.push({
            rule: ref.id,
            title: audit.title,
            snippet: item.node?.snippet || '',
            selector: item.node?.selector || '',
            explanation: item.node?.explanation || '',
          });
        }
      }
    }
  }

  pages.push({ name, scores, cwv, failedAudits, a11yIssues });
}

if (!pages.length) {
  console.log('No valid Lighthouse reports found.');
  process.exit(0);
}

// ── Build report ─────────────────────────────────────────────────────

const lines = [];
const hr = '═'.repeat(110);
const hr2 = '─'.repeat(110);
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

lines.push(hr);
lines.push('  LIGHTHOUSE CI PERFORMANCE & QUALITY REPORT');
lines.push(`  Generated: ${now}`);
lines.push(`  Pages audited: ${pages.length}`);
lines.push(hr);

// ── Scores table ─────────────────────────────────────────────────────

lines.push('');
lines.push('  CATEGORY SCORES');
lines.push(hr2);
lines.push(
  '  ' +
  'Page'.padEnd(40) +
  'Perf  A11y  BP    SEO'
);
lines.push('  ' + '─'.repeat(106));

for (const pg of pages) {
  const s = pg.scores;
  const perfIcon = (s.performance || 0) >= THRESHOLDS.performance ? '✅' : '❌';
  lines.push(
    '  ' + perfIcon + ' ' +
    pg.name.padEnd(38) +
    String(s.performance ?? 'N/A').padEnd(6) +
    String(s.accessibility ?? 'N/A').padEnd(6) +
    String(s['best-practices'] ?? 'N/A').padEnd(6) +
    String(s.seo ?? 'N/A')
  );
}

// ── Core Web Vitals table ────────────────────────────────────────────

lines.push('');
lines.push('  CORE WEB VITALS');
lines.push(hr2);
lines.push(
  '  ' +
  'Page'.padEnd(40) +
  'FCP       LCP       SI        TBT       CLS'
);
lines.push('  ' + '─'.repeat(106));

function formatCwv(key, value) {
  if (value === undefined || value === null) return 'N/A'.padEnd(10);
  const thresh = CWV_THRESHOLDS[key];
  let display;
  if (key === 'cls') {
    display = value.toFixed(3);
  } else {
    display = value >= 1000 ? (value / 1000).toFixed(1) + 's' : Math.round(value) + 'ms';
  }
  const icon = value <= thresh.good ? '🟢' : value <= thresh.poor ? '🟡' : '🔴';
  return (icon + display).padEnd(10);
}

for (const pg of pages) {
  const c = pg.cwv;
  lines.push(
    '  ' +
    pg.name.padEnd(40) +
    formatCwv('fcp', c.fcp) +
    formatCwv('lcp', c.lcp) +
    formatCwv('si', c.si) +
    formatCwv('tbt', c.tbt) +
    formatCwv('cls', c.cls)
  );
}

// ── CWV thresholds legend ────────────────────────────────────────────

lines.push('');
lines.push('  Thresholds: 🟢 Good  🟡 Needs Improvement  🔴 Poor');
for (const [, t] of Object.entries(CWV_THRESHOLDS)) {
  const u = t.unit || '';
  lines.push(`    ${t.label}: 🟢 ≤${t.good}${u}  🟡 ≤${t.poor}${u}  🔴 >${t.poor}${u}`);
}

// ── Summary ──────────────────────────────────────────────────────────

lines.push('');
lines.push(hr);
lines.push('  SUMMARY');
lines.push(hr);
lines.push('');

const catKeys = ['performance', 'accessibility', 'best-practices', 'seo'];
for (const cat of catKeys) {
  const threshold = THRESHOLDS[cat];
  const passed = pages.filter(p => (p.scores[cat] || 0) >= threshold).length;
  const icon = passed === pages.length ? '✅' : '⚠️';
  const label = cat.charAt(0).toUpperCase() + cat.slice(1);
  lines.push(`  ${label.padEnd(20)} >= ${threshold}:  ${passed}/${pages.length}  ${icon}`);
}

// Averages
lines.push('');
lines.push('  Averages:');
for (const cat of catKeys) {
  const avg = pages.reduce((s, p) => s + (p.scores[cat] || 0), 0) / pages.length;
  const label = cat.charAt(0).toUpperCase() + cat.slice(1);
  lines.push(`    ${label.padEnd(20)} ${avg.toFixed(1)}`);
}

// ── Failed audits detail ─────────────────────────────────────────────

const pagesWithFailures = pages.filter(p => p.failedAudits.length > 0);
if (pagesWithFailures.length > 0) {
  lines.push('');
  lines.push(hr);
  lines.push('  FAILED AUDITS (score < 90)');
  lines.push(hr);

  for (const pg of pagesWithFailures) {
    lines.push('');
    lines.push(`  📄 ${pg.name}`);
    lines.push('  ' + '─'.repeat(70));
    for (const a of pg.failedAudits) {
      const val = a.displayValue ? ` (${a.displayValue})` : '';
      lines.push(`    ${String(a.score).padStart(3)}  ${a.title}${val}`);
    }
  }
}

// ── A11y issues detail ───────────────────────────────────────────────

const pagesWithA11y = pages.filter(p => p.a11yIssues.length > 0);
if (pagesWithA11y.length > 0) {
  lines.push('');
  lines.push(hr);
  lines.push('  ACCESSIBILITY ISSUES');
  lines.push(hr);

  for (const pg of pagesWithA11y) {
    lines.push('');
    lines.push(`  📄 ${pg.name}  (${pg.a11yIssues.length} issue${pg.a11yIssues.length > 1 ? 's' : ''})`);
    lines.push('  ' + '─'.repeat(70));
    for (const issue of pg.a11yIssues) {
      lines.push(`    Rule:     ${issue.rule}`);
      lines.push(`    Title:    ${issue.title}`);
      if (issue.selector) lines.push(`    Selector: ${issue.selector}`);
      if (issue.snippet) lines.push(`    Element:  ${issue.snippet.slice(0, 120)}`);
      if (issue.explanation) lines.push(`    Issue:    ${issue.explanation.slice(0, 200)}`);
      lines.push('');
    }
  }
}

// ── Pages passing all gates ──────────────────────────────────────────

const passingAll = pages.filter(p =>
  catKeys.every(cat => (p.scores[cat] || 0) >= THRESHOLDS[cat])
);
if (passingAll.length > 0) {
  lines.push('');
  lines.push(hr);
  lines.push('  PAGES PASSING ALL GATES');
  lines.push(hr);
  for (const pg of passingAll) {
    lines.push(`  ✅ ${pg.name}  (${pg.scores.performance}/${pg.scores.accessibility}/${pg.scores['best-practices']}/${pg.scores.seo})`);
  }
}

// ── Footer ───────────────────────────────────────────────────────────

const totalPassed = catKeys.reduce((sum, cat) => {
  return sum + pages.filter(p => (p.scores[cat] || 0) >= THRESHOLDS[cat]).length;
}, 0);
const totalChecks = catKeys.length * pages.length;

lines.push('');
lines.push(hr);
lines.push(`  END OF REPORT — ${totalPassed}/${totalChecks} checks passed across ${pages.length} pages`);
lines.push(`  HTML reports available in: tests/reports/lighthouse/`);
lines.push(hr);

// ── Write ────────────────────────────────────────────────────────────

const report = lines.join('\n');
fs.writeFileSync(TEXT_PATH, report, 'utf-8');
console.log(`Lighthouse report saved: ${TEXT_PATH}`);
console.log(`Lighthouse files copied: ${allFiles.length} files → ${DEST_DIR}`);
