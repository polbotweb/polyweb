/**
 * QA Global Report Aggregator
 *
 * Reads every individual report produced by the QA pipeline and merges them
 * into a single, easy-to-identify global report:
 *   - tests/reports/qa-report.txt   (human-readable, one-screen overview)
 *   - tests/reports/qa-report.json  (machine-readable, for CI/tooling)
 *
 * Sources consumed (each optional — missing files are skipped, not fatal):
 *   - tests/reports/vitest-results.json      (unit + integration tests)
 *   - tests/reports/playwright-results.json  (e2e tests)
 *   - tests/reports/pa11y-results.json       (accessibility: WCAG)
 *   - tests/reports/lighthouse-report.txt    (perf / a11y / bp / seo scores)
 *
 * Usage:
 *   node tests/helpers/qa-report.cjs                 # aggregate ALL reports
 *   node tests/helpers/qa-report.cjs --scope offline # aggregate only Vitest
 *                                                 (used by `qa:offline`, since
 *                                                  e2e/a11y/lighthouse are not
 *                                                  regenerated in that mode and
 *                                                  their on-disk reports would be
 *                                                  stale)
 *
 * Exit code is 0 when every available report is green, 1 otherwise. This lets
 * the `qa` / `qa:offline` scripts fail loudly when something is broken.
 */

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const SCOPE = args.includes('--scope=offline') || args.includes('--offline') ? 'offline' : 'all';

const REPORTS_DIR = path.resolve(__dirname, '../reports');

const JSON_PATHS = {
  vitest: path.join(REPORTS_DIR, 'vitest-results.json'),
  playwright: path.join(REPORTS_DIR, 'playwright-results.json'),
  pa11y: path.join(REPORTS_DIR, 'pa11y-results.json'),
};
const LIGHTHOUSE_TXT = path.join(REPORTS_DIR, 'lighthouse-report.txt');

const TEXT_PATH = path.join(REPORTS_DIR, 'qa-report.txt');
const GLOBAL_JSON_PATH = path.join(REPORTS_DIR, 'qa-report.json');

const hr = '═'.repeat(82);
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

const lines = [];
const sections = []; // { key, title, ok, summary, detail[] }

function readJsonSafe(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

function icon(ok) {
  return ok ? '✅' : '❌';
}

// ── Vitest (unit + integration) ──────────────────────────────────────

function collectVitest() {
  const data = readJsonSafe(JSON_PATHS.vitest);
  if (!data) return null;

  const suites = data.testResults || [];
  let total = 0, passed = 0, failed = 0, skipped = 0;
  const failures = [];

  for (const suite of suites) {
    const rel = path.relative(process.cwd(), suite.name);
    for (const t of (suite.assertionResults || [])) {
      if (t.status === 'passed') passed++;
      else if (t.status === 'failed') {
        failed++;
        failures.push({ suite: rel, test: t.fullName || t.title, message: (t.failureMessages || []).join('\n').slice(0, 240) });
      } else skipped++;
      total++;
    }
  }

  const ok = failed === 0 && data.success !== false;
  return {
    key: 'vitest',
    title: 'Unit & Integration Tests (Vitest)',
    ok,
    summary: `${passed}/${total} passed${skipped ? `, ${skipped} skipped` : ''}${failed ? `, ${failed} failed` : ''}`,
    detail: failures.length
      ? failures.map((f) => `  • ${f.suite} › ${f.test}\n    ${f.message.split('\n')[0]}`)
      : [],
    metrics: { total, passed, failed, skipped },
  };
}

// ── Playwright (e2e) ─────────────────────────────────────────────────

function collectPlaywright() {
  const data = readJsonSafe(JSON_PATHS.playwright);
  if (!data) return null;

  let total = 0, passed = 0, failed = 0, skipped = 0;
  const failures = [];

  function walk(suite, name) {
    const full = name ? `${name} > ${suite.title}` : suite.title;
    for (const spec of (suite.specs || [])) {
      for (const test of (spec.tests || [])) {
        total++;
        const status = test.status || test.expectedStatus;
        if (status === 'expected' || status === 'passed') passed++;
        else if (status === 'skipped') skipped++;
        else {
          failed++;
          failures.push({ suite: full, test: spec.title, message: test.results?.[0]?.error?.message || 'No error message' });
        }
      }
    }
    for (const child of (suite.suites || [])) walk(child, full);
  }

  for (const s of (data.suites || [])) walk(s, '');

  const ok = failed === 0;
  return {
    key: 'playwright',
    title: 'End-to-End Tests (Playwright)',
    ok,
    summary: `${passed}/${total} passed${skipped ? `, ${skipped} skipped` : ''}${failed ? `, ${failed} failed` : ''}`,
    detail: failures.length
      ? failures.map((f) => `  • ${f.suite} › ${f.test}\n    ${String(f.message).split('\n')[0].slice(0, 200)}`)
      : [],
    metrics: { total, passed, failed, skipped },
  };
}

// ── Pa11y (accessibility) ────────────────────────────────────────────

function collectPa11y() {
  const data = readJsonSafe(JSON_PATHS.pa11y);
  if (!data) return null;

  const urls = Object.keys(data.results || {});
  const passes = data.passes || 0;
  const errors = data.errors || 0;
  const ok = errors === 0;

  // Group issues by rule
  const byRule = {};
  for (const issues of Object.values(data.results || {})) {
    if (!Array.isArray(issues)) continue;
    for (const issue of issues) {
      byRule[issue.code] = (byRule[issue.code] || 0) + 1;
    }
  }
  const ruleLines = Object.entries(byRule)
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `  • ${code}: ${n} occurrence(s)`);

  return {
    key: 'pa11y',
    title: 'Accessibility Audit (Pa11y — WCAG 2.1 AAA)',
    ok,
    summary: `${passes}/${urls.length} URLs clean${errors ? `, ${errors} issue(s) across ${Object.keys(byRule).length} rule(s)` : ''}`,
    detail: ok ? [] : ruleLines,
    metrics: { urls: urls.length, passes, errors, rules: Object.keys(byRule).length },
  };
}

// ── Lighthouse (perf / a11y / bp / seo) ──────────────────────────────

function collectLighthouse() {
  if (!fs.existsSync(LIGHTHOUSE_TXT)) return null;
  const txt = fs.readFileSync(LIGHTHOUSE_TXT, 'utf-8');

  // Parse the CATEGORY SCORES table to count pages below threshold (90).
  const catBlock = txt.split('CATEGORY SCORES')[1]?.split('CORE WEB VITALS')[0] || '';
  const rows = catBlock.split('\n').filter((l) => l.includes('❌') || l.includes('✅'));
  let below = 0;
  for (const r of rows) {
    if (r.includes('❌')) below++;
  }
  const ok = below === 0;
  const pages = rows.length;

  return {
    key: 'lighthouse',
    title: 'Performance & Quality Audit (Lighthouse CI)',
    ok,
    summary: `${pages} page(s) audited${below ? `, ${below} below threshold (≥90)` : ', all ≥90'}`,
    detail: ok ? [] : [`  • ${below} page(s) scored below the 90 threshold (see lighthouse-report.txt for detail)`],
    metrics: { pages, belowThreshold: below },
  };
}

// ── Astro check (type/lint via astro check) ─────────────────────────

function collectCheck() {
  const p = path.join(REPORTS_DIR, 'check-report.txt');
  if (!fs.existsSync(p)) return null;
  const txt = fs.readFileSync(p, 'utf-8');
  const m = txt.match(/Result\s*\(\d+\s*files\):\s*- (\d+) errors\s*- (\d+) warnings\s*- (\d+) hints/i);
  const errors = m ? Number(m[1]) : (/\berror\b/i.test(txt) ? 1 : 0);
  const warnings = m ? Number(m[2]) : 0;
  const hints = m ? Number(m[3]) : 0;
  const ok = errors === 0;
  return {
    key: 'check',
    title: 'Type & Template Check (astro check)',
    ok,
    summary: `${errors} errors, ${warnings} warnings, ${hints} hints`,
    detail: ok ? [] : ['  • See tests/reports/check-report.txt for details'],
    metrics: { errors, warnings, hints },
  };
}

// ── ESLint ───────────────────────────────────────────────────────────

function collectLint() {
  const p = path.join(REPORTS_DIR, 'lint-report.txt');
  if (!fs.existsSync(p)) return null;
  const txt = fs.readFileSync(p, 'utf-8');
  const m = txt.match(/(\d+)\s*problems\s*\((\d+)\s*errors?,\s*(\d+)\s*warnings?\)/i);
  const errors = m ? Number(m[2]) : (/\berror\b/i.test(txt) ? 1 : 0);
  const warnings = m ? Number(m[3]) : 0;
  const ok = errors === 0;
  return {
    key: 'lint',
    title: 'Lint (ESLint)',
    ok,
    summary: `${errors} errors, ${warnings} warnings`,
    detail: ok ? [] : ['  • See tests/reports/lint-report.txt for details'],
    metrics: { errors, warnings },
  };
}

// ── Build global report ──────────────────────────────────────────────

const check = collectCheck();
const lint = collectLint();
const vitest = collectVitest();
const playwright = collectPlaywright();
const pa11y = collectPa11y();
const lighthouse = collectLighthouse();

// In offline scope, only check/lint/vitest are freshly regenerated; the other
// reports on disk may be stale, so we exclude them from the global verdict.
const candidates = SCOPE === 'offline'
  ? [check, lint, vitest]
  : [check, lint, vitest, playwright, pa11y, lighthouse];

const present = candidates.filter(Boolean);
const allOk = present.length > 0 && present.every((s) => s.ok);

lines.push(hr);
lines.push('  ATOMIC — GLOBAL QA REPORT');
lines.push(`  Generated: ${now}`);
if (SCOPE === 'offline') {
  lines.push('  Scope:    offline (check + lint + vitest — e2e/a11y/lighthouse not regenerated)');
}
lines.push(hr);
lines.push('');

for (const s of present) {
  lines.push(`  ${icon(s.ok)} ${s.title}`);
  lines.push(`     ${s.summary}`);
  if (s.detail.length) {
    lines.push('');
    for (const d of s.detail) lines.push(d);
  }
  lines.push('');
  sections.push(s);
}

lines.push(hr);
lines.push('  GLOBAL STATUS');
lines.push(hr);
lines.push('');
const scopeLabel = SCOPE === 'offline'
  ? '3/6 (check, lint, vitest — offline scope)'
  : '6/6 (check, lint, vitest, playwright, pa11y, lighthouse)';
lines.push(`  Reports in scope: ${scopeLabel}`);
lines.push(`  Overall:           ${allOk ? '✅ ALL GREEN' : '❌ ISSUES DETECTED'}`);
lines.push('');

// Per-report quick table
lines.push('  ┌─────────────────────────────────────────────┬──────────────┬─────────┐');
lines.push('  │ Report                                      │ Status       │ Result  │');
lines.push('  ├─────────────────────────────────────────────┼──────────────┼─────────┤');
const rowName = {
  check: 'Astro check',
  lint: 'ESLint',
  vitest: 'Vitest (unit/integration)',
  playwright: 'Playwright (e2e)',
  pa11y: 'Pa11y (a11y)',
  lighthouse: 'Lighthouse (perf)',
};
const rowKeys = SCOPE === 'offline'
  ? ['check', 'lint', 'vitest']
  : ['check', 'lint', 'vitest', 'playwright', 'pa11y', 'lighthouse'];
for (const key of rowKeys) {
  const s = present.find((x) => x.key === key);
  const name = (rowName[key] || key).padEnd(43).slice(0, 43);
  const status = (s ? (s.ok ? 'GREEN' : 'RED') : 'MISSING').padEnd(12).slice(0, 12);
  const result = (s ? s.summary : 'not generated').padEnd(7).slice(0, 7);
  lines.push(`  │ ${name} │ ${status} │ ${result} │`);
}
lines.push('  └─────────────────────────────────────────────┴──────────────┴─────────┘');
lines.push('');
lines.push(hr);
lines.push(`  END OF GLOBAL REPORT — ${allOk ? 'ALL GREEN' : 'ACTION REQUIRED'}`);
lines.push(hr);

fs.writeFileSync(TEXT_PATH, lines.join('\n'), 'utf-8');

// Machine-readable mirror
const globalJson = {
  generatedAt: now,
  overall: allOk ? 'green' : 'red',
  reportsAvailable: present.length,
  sections: sections.map((s) => ({ key: s.key, title: s.title, ok: s.ok, summary: s.summary, metrics: s.metrics })),
};
fs.writeFileSync(GLOBAL_JSON_PATH, JSON.stringify(globalJson, null, 2), 'utf-8');

console.log(`Global QA report saved: ${TEXT_PATH}`);
console.log(`Global QA JSON saved:   ${GLOBAL_JSON_PATH}`);
console.log(`Overall status: ${allOk ? 'ALL GREEN' : 'ISSUES DETECTED'}`);

process.exit(allOk ? 0 : 1);
