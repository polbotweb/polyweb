#!/usr/bin/env node
/**
 * Cross-platform QA orchestrator (single entry point for `pnpm qa` / `qa:offline`).
 *
 * Goals:
 *  1. Keep check / build / lint VISIBLE — every command runs with stdio:'inherit'
 *     so its output is printed live in the terminal (nothing is hidden in a script).
 *  2. Persist a report file for EVERY gate, not just tests:
 *       - tests/reports/check-report.txt   (astro check)
 *       - tests/reports/lint-report.txt    (eslint)
 *       - tests/reports/vitest-report.txt  (unit/integration)
 *       - tests/reports/playwright-report.txt (e2e, full mode)
 *       - tests/reports/pa11y-report.txt + lighthouse-report.txt (a11y, full mode)
 *       - tests/reports/qa-report.txt + qa-report.json (global aggregator)
 *  3. Fix the stale-report bug: previously `pnpm test && pnpm test:report` would
 *     short-circuit test:report when tests failed, leaving a fresh JSON next to a
 *     stale TXT. Here every report is regenerated right after its source, even on
 *     failure. The run still exits non-zero if any gate fails.
 *
 * Usage:
 *   node scripts/qa.mjs offline   # check + build + lint + vitest + reports
 *   node scripts/qa.mjs full      # + e2e + a11y + lighthouse + reports
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = resolve(__dirname, '../tests/reports');
mkdirSync(REPORTS_DIR, { recursive: true });

const mode = process.argv[2] === 'full' ? 'full' : 'offline';
const offline = mode === 'offline';

/** Run a command with live output. Returns its exit code. */
function run(cmd) {
  console.log(`\n${'═'.repeat(82)}\n▶ ${cmd}\n${'═'.repeat(82)}`);
  try {
    execSync(cmd, { stdio: 'inherit', env: process.env });
    return 0;
  } catch (err) {
    return typeof err.status === 'number' ? err.status : 1;
  }
}

/** Run a command and capture its combined output to a report file. Returns exit code. */
function runCaptured(cmd, outFile) {
  console.log(`\n${'═'.repeat(82)}\n▶ ${cmd}  →  ${outFile}\n${'═'.repeat(82)}`);
  let output = '';
  try {
    output = execSync(cmd, { encoding: 'utf-8', env: process.env });
    writeFileSync(outFile, output, 'utf-8');
    return 0;
  } catch (err) {
    if (typeof err.stdout === 'string') output += err.stdout;
    if (typeof err.stderr === 'string') output += err.stderr;
    writeFileSync(outFile, output, 'utf-8');
    return typeof err.status === 'number' ? err.status : 1;
  }
}

// ── 1) Validation gates (visible + captured to files) ────────────────
const checkCode = runCaptured('pnpm check', resolve(REPORTS_DIR, 'check-report.txt'));
const buildCode = run('pnpm build');
const lintCode = runCaptured('pnpm lint', resolve(REPORTS_DIR, 'lint-report.txt'));

// ── 2) Unit + integration tests (capture + always regenerate TXT) ─────
const testCode = runCaptured('pnpm test -- --coverage', resolve(REPORTS_DIR, 'test-report.txt'));
run('pnpm test:report'); // ALWAYS regenerate vitest-report.txt from JSON

// ── 3) E2E + accessibility (full mode only) ──────────────────────────
let e2eCode = 0;
if (!offline) {
  e2eCode = run('pnpm test:e2e');
  run('pnpm test:e2e:report'); // ALWAYS regenerate playwright-report.txt
  run('pnpm a11y'); // regenerates pa11y + lighthouse reports
}

// ── 4) Global aggregated report ──────────────────────────────────────
const reportCode = run(`pnpm qa:report${offline ? ' --scope=offline' : ''}`);

// ── 5) Final verdict ──────────────────────────────────────────────────
const gateCode = [checkCode, buildCode, lintCode].find((c) => c !== 0) ?? 0;
const finalCode = gateCode !== 0
  ? gateCode
  : testCode !== 0
    ? testCode
    : offline
      ? reportCode
      : e2eCode !== 0
        ? e2eCode
        : reportCode;

console.log(`\n${'═'.repeat(82)}`);
console.log(
  `${finalCode === 0 ? '✅ QA PASSED' : '❌ QA FAILED'} (exit ${finalCode})` +
    `  [check:${checkCode} build:${buildCode} lint:${lintCode} test:${testCode}` +
    `${offline ? '' : ` e2e:${e2eCode}`} report:${reportCode}]`,
);
console.log(`${'═'.repeat(82)}`);
process.exit(finalCode);
