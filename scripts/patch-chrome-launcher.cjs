/**
 * Postinstall patch for chrome-launcher@1.2.1
 * Wraps the destroyTmp() rmSync call in a try/catch to prevent EPERM crashes
 * on Windows + Node 25 when Chrome holds a lock on its temp directory.
 *
 * This is a known issue: https://github.com/nicolo-ribaudo/chrome-launcher/issues/266
 */

const fs = require('node:fs');
const path = require('node:path');

const targetFile = path.resolve(
  __dirname,
  '../node_modules/.pnpm/chrome-launcher@1.2.1/node_modules/chrome-launcher/dist/chrome-launcher.js'
);

if (!fs.existsSync(targetFile)) {
  // chrome-launcher not installed or different version — skip silently
  process.exit(0);
}

const content = fs.readFileSync(targetFile, 'utf-8');
const needle = 'rmSync(this.userDataDir, { recursive: true, force: true, maxRetries: 10 });';

if (!content.includes(needle)) {
  // Already patched or code changed — skip
  process.exit(0);
}

const patched = content.replace(
  needle,
  `try { ${needle} } catch (e) { log.warn('ChromeLauncher', 'Failed to cleanup tmp dir: ' + e.message); }`
);

fs.writeFileSync(targetFile, patched, 'utf-8');
console.log('[postinstall] Patched chrome-launcher destroyTmp (EPERM workaround)');
