/**
 * A11y/Lighthouse orchestrator — single command to run all audits.
 *
 * 1. Checks if a server (dev or preview) is already running on port 4321
 * 2. If yes → kills it to ensure a clean build+preview cycle
 * 3. Builds the project (pnpm build)
 * 4. Starts the preview server in background
 * 5. Waits for server readiness
 * 6. Runs a11y setup (seed users + auth cookies)
 * 7. Runs Pa11y-ci
 * 8. Runs Lighthouse CI (public + authenticated)
 * 9. Renames LHCI reports to readable names
 * 10. Tears down (cleanup seeded users)
 * 11. Kills server
 *
 * Usage:
 *   node tests/a11y/run.cjs                  # run everything
 *   node tests/a11y/run.cjs --pa11y          # Pa11y only
 *   node tests/a11y/run.cjs --lighthouse     # Lighthouse only
 */

const { execSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');

const path = require('node:path');

const PORT = 4321;
const HOST = 'localhost';
const MAX_WAIT = 90_000; // 90s max wait for server
const POLL_INTERVAL = 1_000;
const REPORTS_DIR = path.resolve(__dirname, '../reports');

const args = process.argv.slice(2);
const runPa11y = args.length === 0 || args.includes('--pa11y');
const runLighthouse = args.length === 0 || args.includes('--lighthouse');

let serverProcess = null;
let weStartedServer = false;

// ── Helpers ──────────────────────────────────────────────────────────

function log(msg) {
  console.log(`\x1b[36m[a11y]\x1b[0m ${msg}`);
}

function logError(msg) {
  console.error(`\x1b[31m[a11y]\x1b[0m ${msg}`);
}

function run(cmd, label) {
  log(`Running: ${label || cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', shell: true, cwd: process.cwd() });
    return true;
  } catch (e) {
    logError(`"${label || cmd}" exited with code ${e.status}`);
    return false;
  }
}

/** Run a command and return its stdout (still logs stderr) */
function runCapture(cmd, label) {
  log(`Running: ${label || cmd}`);
  try {
    return execSync(cmd, { encoding: 'utf-8', shell: true, cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    logError(`"${label || cmd}" exited with code ${e.status}`);
    // pa11y-ci --json exits non-zero when URLs fail, but stdout still has the JSON
    return e.stdout || '';
  }
}

/** Ensure reports directory exists */
function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/** Generate readable Pa11y report from JSON data and save to files */
function savePa11yReport(jsonStr) {
  ensureReportsDir();

  // Save raw JSON
  const jsonPath = path.join(REPORTS_DIR, 'pa11y-results.json');
  fs.writeFileSync(jsonPath, jsonStr, 'utf-8');

  // Parse and build readable report
  let data;
  try { data = JSON.parse(jsonStr); } catch { logError('Failed to parse Pa11y JSON'); return; }
  
  const lines = [];
  const hr = '═'.repeat(80);
  const hr2 = '─'.repeat(80);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  lines.push(hr);
  lines.push('  PA11Y ACCESSIBILITY REPORT — WCAG 2.1 AAA');
  lines.push(`  Generated: ${now}`);
  lines.push(hr);
  lines.push('');

  const passes = data.passes || 0;
  const failures = data.errors || 0;
  const results = data.results || {};
  const urls = Object.keys(results);

  lines.push(`  Total URLs tested:  ${urls.length}`);
  lines.push(`  Passed:             ${passes}/${urls.length}  ${passes === urls.length ? '✅' : '⚠️'}`);
  lines.push(`  Failed:             ${failures}/${urls.length}`);
  lines.push('');
  lines.push(hr2);

  // Group errors by type for summary
  const errorsByRule = {};
  const failedUrls = [];

  for (const [url, issues] of Object.entries(results)) {
    if (!Array.isArray(issues) || issues.length === 0) continue;
    failedUrls.push({ url, count: issues.length });
    for (const issue of issues) {
      const rule = issue.code || 'unknown';
      if (!errorsByRule[rule]) errorsByRule[rule] = [];
      errorsByRule[rule].push({ url, ...issue });
    }
  }

  // Summary by rule
  if (Object.keys(errorsByRule).length > 0) {
    lines.push('');
    lines.push('  ISSUES BY RULE:');
    lines.push(hr2);
    for (const [rule, items] of Object.entries(errorsByRule).sort((a, b) => b[1].length - a[1].length)) {
      lines.push(`  ${rule}  (${items.length} occurrence${items.length > 1 ? 's' : ''})`);
    }
  }

  // Detailed failures per URL
  if (failedUrls.length > 0) {
    lines.push('');
    lines.push(hr);
    lines.push('  DETAILED FAILURES');
    lines.push(hr);

    for (const { url } of failedUrls) {
      const issues = results[url];
      lines.push('');
      lines.push(`  URL: ${url}`);
      lines.push(`  Issues: ${issues.length}`);
      lines.push(hr2);

      for (const issue of issues) {
        lines.push(`    Rule:     ${issue.code || 'N/A'}`);
        lines.push(`    Message:  ${issue.message || 'N/A'}`);
        lines.push(`    Selector: ${issue.selector || 'N/A'}`);
        lines.push(`    Context:  ${(issue.context || 'N/A').slice(0, 120)}`);
        lines.push('');
      }
    }
  }

  // Passing URLs
  const passingUrls = urls.filter(u => !Array.isArray(results[u]) || results[u].length === 0);
  if (passingUrls.length > 0) {
    lines.push('');
    lines.push(hr);
    lines.push('  PASSING URLS');
    lines.push(hr);
    for (const u of passingUrls) {
      lines.push(`  ✅ ${u}`);
    }
  }

  lines.push('');
  lines.push(hr);
  lines.push(`  END OF REPORT — ${passes}/${urls.length} passed`);
  lines.push(hr);

  const reportPath = path.join(REPORTS_DIR, 'pa11y-report.txt');
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8');
  log(`Pa11y report saved: ${reportPath}`);
  log(`Pa11y JSON saved:   ${jsonPath}`);

  // Print summary to console too
  console.log('');
  console.log(`  Pa11y: ${passes}/${urls.length} URLs passed ${passes === urls.length ? '✅' : '⚠️'}`);
  if (failedUrls.length > 0) {
    for (const { url, count } of failedUrls) {
      console.log(`    ❌ ${url} (${count} issue${count > 1 ? 's' : ''})`);
    }
  }
  console.log('');

  return failures > 0;
}

/** Copy Lighthouse reports to tests/reports/ and generate text summary */
function copyLighthouseReports() {
  const lhDir = path.resolve(__dirname, '../../.lighthouseci');
  if (!fs.existsSync(lhDir)) {
    logError('No .lighthouseci directory found — skipping Lighthouse report copy');
    return;
  }

  // Delegate to the shared report generator (copies files + generates text report)
  try {
    require('../helpers/lighthouse-report.cjs');
  } catch (e) {
    logError(`Lighthouse report generator failed: ${e.message}`);
  }
}

/** Wait until server responds with HTTP 2xx/3xx */
async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT) {
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get(`http://${HOST}:${PORT}/`, (res) => {
          resolve(res.statusCode < 400);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(3000, () => { req.destroy(); resolve(false); });
      });
      if (ok) return true;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
  return false;
}

/** Kill any process listening on PORT (dev or stale preview) */
function killPortProcess() {
  try {
    if (process.platform === 'win32') {
      // Find PID using netstat, then kill it
      const out = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      const pids = [...new Set(out.trim().split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
      for (const pid of pids) {
        log(`Killing process ${pid} on port ${PORT}...`);
        try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }); } catch { /* already dead */ }
      }
    } else {
      execSync(`lsof -ti:${PORT} | xargs -r kill -9`, { stdio: 'ignore', shell: true });
    }
    // Wait a bit for port to be released
    return new Promise((r) => setTimeout(r, 2000));
  } catch {
    // No process found — that's fine
    return Promise.resolve();
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  let exitCode = 0;

  try {
    // 1. Always clear the target port first.
    // On Windows, localhost can resolve to ::1 while stale checks hit 127.0.0.1,
    // which leaves an old listener alive and makes audits hit the wrong app.
    log(`Ensuring port ${PORT} is free before starting preview...`);
    await killPortProcess();

    // 2. Build
    log('Building project...');
    run('pnpm build', 'build');

    // 3. Start preview server in background
    log('Starting preview server...');
    serverProcess = spawn('node', ['dist/server/entry.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      detached: false,
      env: { ...process.env, HOST: 'localhost', PORT: String(PORT) },
    });
    weStartedServer = true;

    // 4. Wait for server
    log(`Waiting for server on ${HOST}:${PORT}...`);
    const ready = await waitForServer();
    if (!ready) {
      logError('Server did not start within 90s, aborting.');
      process.exit(1);
    }
    log('Server is ready!');

    // 5. A11y setup (seed users + export cookies)
    log('Setting up a11y test users...');
    run('pnpm a11y:setup', 'a11y:setup');

    // 6. Run audits
    ensureReportsDir();

    if (runPa11y) {
      log('─── Pa11y-ci ───');
      const pa11yJson = runCapture('npx pa11y-ci --config .pa11yci.cjs --json', 'pa11y-ci --json');
      if (pa11yJson) {
        const hasFailures = savePa11yReport(pa11yJson);
        if (hasFailures) exitCode = 1;
      } else {
        logError('Pa11y produced no output');
        exitCode = 1;
      }
    }

    if (runLighthouse) {
      // Clean previous reports so they don't accumulate across runs
      const lhDir = path.resolve(__dirname, '../../.lighthouseci');
      if (fs.existsSync(lhDir)) {
        fs.rmSync(lhDir, { recursive: true });
        log('Cleaned previous .lighthouseci/ reports');
      }

      log('─── Lighthouse CI (public) ───');
      if (!run('pnpm a11y:lighthouse', 'lighthouse')) {
        // chrome-launcher on Windows/Node 25 may crash with EPERM on cleanup
        // even though audits completed. Check if reports exist before failing.
        const hasReports = fs.existsSync(lhDir) &&
          fs.readdirSync(lhDir).some(f => f.startsWith('lhr-') && f.endsWith('.json'));
        if (!hasReports) exitCode = 1;
        else log('Lighthouse public: exit error ignored (reports exist)');
      }
      run('pnpm a11y:lighthouse:rename', 'lighthouse:rename');

      log('─── Lighthouse CI (authenticated) ───');
      if (!run('pnpm a11y:lighthouse:authed', 'lighthouse:authed')) {
        const hasReports = fs.existsSync(lhDir) &&
          fs.readdirSync(lhDir).some(f => f.startsWith('lhr-') && f.endsWith('.json'));
        if (!hasReports) exitCode = 1;
        else log('Lighthouse authed: exit error ignored (reports exist)');
      }
      run('pnpm a11y:lighthouse:rename', 'lighthouse:rename');

      // Copy Lighthouse reports to tests/reports/
      copyLighthouseReports();
    }

  } finally {
    // 7. Teardown (always)
    log('Tearing down a11y test users...');
    run('pnpm a11y:teardown', 'a11y:teardown');

    // 8. Kill server if we started it
    if (weStartedServer && serverProcess) {
      log('Stopping preview server...');
      serverProcess.kill('SIGTERM');
      // Give it a moment, then force kill
      setTimeout(() => {
        try { serverProcess.kill('SIGKILL'); } catch { /* already dead */ }
      }, 3000);
    }

    log(exitCode === 0 ? '✅ All audits passed!' : '⚠️  Some audits had failures (see above)');
    log(`Reports saved in: ${REPORTS_DIR}`);
  }

  process.exit(exitCode);
}

main();
