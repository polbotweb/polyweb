/**
 * Generate a human-readable text report from Vitest JSON results.
 *
 * Usage: node tests/helpers/vitest-report.cjs
 *
 * Reads tests/reports/vitest-results.json (produced by vitest --reporter=json)
 * and writes tests/reports/vitest-report.txt with a formatted summary.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPORTS_DIR = path.resolve(__dirname, '../reports');
const JSON_PATH = path.join(REPORTS_DIR, 'vitest-results.json');
const TEXT_PATH = path.join(REPORTS_DIR, 'vitest-report.txt');

if (!fs.existsSync(JSON_PATH)) {
  console.log('No vitest-results.json found. Run "pnpm test" first.');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
const lines = [];
const hr = '═'.repeat(80);
const hr2 = '─'.repeat(80);
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

lines.push(hr);
lines.push('  VITEST UNIT & INTEGRATION TEST REPORT');
lines.push(`  Generated: ${now}`);
lines.push(hr);
lines.push('');

const suites = data.testResults || [];
let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;
const failedDetails = [];

for (const suite of suites) {
  const relPath = path.relative(process.cwd(), suite.name);
  const passed = suite.assertionResults?.filter(t => t.status === 'passed').length || 0;
  const failed = suite.assertionResults?.filter(t => t.status === 'failed').length || 0;
  const skipped = suite.assertionResults?.filter(t => t.status === 'pending' || t.status === 'skipped').length || 0;
  const total = passed + failed + skipped;
  const icon = failed > 0 ? '❌' : '✅';

  totalTests += total;
  totalPassed += passed;
  totalFailed += failed;
  totalSkipped += skipped;

  lines.push(`  ${icon} ${relPath}  (${passed}/${total} passed${skipped ? `, ${skipped} skipped` : ''})`);

  // Collect failures
  if (failed > 0) {
    const failures = suite.assertionResults.filter(t => t.status === 'failed');
    for (const f of failures) {
      failedDetails.push({
        suite: relPath,
        test: f.fullName || f.title,
        message: (f.failureMessages || []).join('\n').slice(0, 300),
      });
    }
  }
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
lines.push(`  Duration:      ${data.startTime ? Math.round((Date.now() - data.startTime) / 1000) + 's' : 'N/A'}`);

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
console.log(`Vitest text report saved: ${TEXT_PATH}`);
