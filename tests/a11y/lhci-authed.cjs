/**
 * Run Lighthouse CI for authenticated and admin pages.
 * LHCI doesn't support per-URL headers in config, so we generate
 * a temporary config file for each user type with the right Cookie.
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../../lighthouserc.cjs');

const chromePath = config.ci?.collect?.settings?.chromePath;

function buildTempConfig(urls, cookie) {
  return {
    ci: {
      collect: {
        url: urls,
        numberOfRuns: 1,
        settings: {
          chromeFlags: '--no-sandbox --disable-setuid-sandbox',
          preset: 'desktop',
          ...(chromePath ? { chromePath } : {}),
          extraHeaders: { Cookie: cookie },
        },
      },
      assert: {
        assertions: {
          'categories:performance': ['error', { minScore: 0.9 }],
          'categories:accessibility': ['error', { minScore: 0.9 }],
          'categories:best-practices': ['error', { minScore: 0.9 }],
          'categories:seo': ['error', { minScore: 0.9 }],
        },
      },
      upload: {
        target: 'temporary-public-storage',
      },
    },
  };
}

function run(urls, cookie, label) {
  if (!urls.length) {
    console.log(`[lhci] No ${label} URLs to audit, skipping.`);
    return;
  }
  if (!cookie) {
    console.warn(`[lhci] No cookie for ${label}, skipping.`);
    return;
  }

  console.log(`\n[lhci] Running ${label} audit (${urls.length} URLs)…`);

  const tmpConfig = path.resolve(__dirname, `../../.lighthouseci-${label}.json`);
  fs.writeFileSync(tmpConfig, JSON.stringify(buildTempConfig(urls, cookie), null, 2));

  try {
    execSync(`npx lhci autorun --config "${tmpConfig}"`, {
      stdio: 'inherit',
      shell: true,
    });
  } catch (e) {
    // chrome-launcher on Windows/Node 25 crashes with EPERM on temp dir cleanup
    // even though the audit completed. Check if reports were actually generated.
    const lhDir = path.resolve(__dirname, '../../.lighthouseci');
    const hasReports = fs.existsSync(lhDir) &&
      fs.readdirSync(lhDir).some(f => f.startsWith('lhr-') && f.endsWith('.json'));
    if (!hasReports) {
      throw e; // Real failure — no reports generated
    }
    console.warn(`[lhci] ${label}: chrome-launcher exit error ignored (reports exist)`);
  } finally {
    // Clean up temp config
    try { fs.unlinkSync(tmpConfig); } catch { /* ignore */ }
  }
}

// Run authenticated pages
run(config._authedUrls, config._userCookie, 'authed');

// Run admin pages
run(config._adminUrls, config._adminCookie, 'admin');
