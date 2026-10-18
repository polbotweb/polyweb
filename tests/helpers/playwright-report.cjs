/**
 * Generate a human-readable text report from Playwright JSON results.
 *
 * Usage: node tests/helpers/playwright-report.cjs
 *
 * Reads tests/reports/playwright-results.json (produced by playwright --reporter=json)
 * and writes tests/reports/playwright-report.txt with a formatted summary.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPORTS_DIR = path.resolve(__dirname, '../reports');
const JSON_PATH = path.join(REPORTS_DIR, 'playwright-results.json');
const TEXT_PATH = path.join(REPORTS_DIR, 'playwright-report.txt');

if (!fs.existsSync(JSON_PATH)) {
  console.log('No playwright-results.json found. Run "pnpm test:e2e" first.');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
const lines = [];
const hr = '═'.repeat(80);
const hr2 = '─'.repeat(80);
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

lines.push(hr);
lines.push('  PLAYWRIGHT E2E TEST REPORT');
lines.push(`  Generated: ${now}`);
lines.push(hr);
lines.push('');

const suites = data.suites || [];
let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;
const failedDetails = [];

/** Recursively extract specs from nested suites */
function extractSpecs(suite, suiteName) {
  const name = suiteName ? `${suiteName} > ${suite.title}` : suite.title;

  for (const spec of (suite.specs || [])) {
    for (const test of (spec.tests || [])) {
      totalTests++;
      const status = test.status || test.expectedStatus;
      if (status === 'expected' || status === 'passed') {
        totalPassed++;
      } else if (status === 'skipped') {
        totalSkipped++;
      } else {
        totalFailed++;
        const msg = test.results?.[0]?.error?.message || 'No error message';
        failedDetails.push({
          suite: name,
          test: spec.title,
          message: msg.slice(0, 300),
        });
      }
    }
  }

  for (const child of (suite.suites || [])) {
    extractSpecs(child, name);
  }
}

for (const suite of suites) {
  extractSpecs(suite, '');
}

// List suites with pass/fail (count recursively)
function countSuiteResults(suite) {
  let passed = 0, total = 0;
  for (const spec of (suite.specs || [])) {
    for (const test of (spec.tests || [])) {
      total++;
      if (test.status === 'expected' || test.status === 'passed') passed++;
    }
  }
  for (const child of (suite.suites || [])) {
    const r = countSuiteResults(child);
    passed += r.passed;
    total += r.total;
  }
  return { passed, total };
}

for (const suite of suites) {
  const { passed, total } = countSuiteResults(suite);
  const icon = passed === total ? '✅' : '❌';
  lines.push(`  ${icon} ${suite.title}  (${passed}/${total} tests passed)`);
}

lines.push('');
lines.push(hr);
lines.push('  SUMMARY');
lines.push(hr);
lines.push('');
lines.push(`  Total tests:   ${totalTests}`);
lines.push(`  Passed:        ${totalPassed}  ${totalFailed === 0 ? '✅' : ''}`);
lines.push(`  Failed:        ${totalFailed}  ${totalFailed > 0 ? '❌' : ''}`);
if (totalSkipped > 0) {
  lines.push(`  Skipped:       ${totalSkipped}`);
}

const durationMs = data.stats?.duration || 0;
lines.push(`  Duration:      ${(durationMs / 1000).toFixed(1)}s`);

if (failedDetails.length > 0) {
  lines.push('');
  lines.push(hr);
  lines.push('  FAILURES');
  lines.push(hr);

  for (const f of failedDetails) {
    lines.push('');
    lines.push(`  Suite: ${f.suite}`);
    lines.push(`  Test:  ${f.test}`);
    lines.push(hr2);
    lines.push(`  ${f.message}`);
    lines.push('');
  }
}

lines.push('');
lines.push(hr);
lines.push(`  END OF REPORT — ${totalPassed}/${totalTests} passed`);
lines.push(hr);

fs.writeFileSync(TEXT_PATH, lines.join('\n'), 'utf-8');
console.log(`Playwright text report saved: ${TEXT_PATH}`);
