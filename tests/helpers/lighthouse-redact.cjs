/**
 * Caviardage des rapports Lighthouse : les audits authentifiés passent le cookie
 * de session via `settings.extraHeaders`, que Lighthouse recopie dans chaque
 * LHR (JSON et HTML). Ces fonctions remplacent toute valeur d'en-tête sensible
 * et tout cookie better-auth par « [REDACTED] », puis vérifient qu'il n'en reste aucun.
 */

const fs = require('node:fs');
const path = require('node:path');

const REDACTED = '[REDACTED]';
const SENSITIVE_HEADER = /("(?:cookie|authorization|x-api-key)"\s*:\s*")((?:[^"\\]|\\.)*)(")/gi;
const SESSION_COOKIE = /(better-auth\.[\w.-]+=)([^;"'\s\\&]+)/g;

function redactText(text) {
  return text
    .replace(SENSITIVE_HEADER, (m, a, value, b) => (value === '' || value === REDACTED ? m : `${a}${REDACTED}${b}`))
    .replace(SESSION_COOKIE, (m, a, value) => (value.startsWith(REDACTED) ? m : `${a}${REDACTED}`));
}

/** Motifs résiduels : renvoie la liste des fuites trouvées (vide si propre). */
function findLeaks(text) {
  const leaks = [];
  for (const m of text.matchAll(SENSITIVE_HEADER)) if (m[2] !== '' && m[2] !== REDACTED) leaks.push(m[0].slice(0, 40));
  for (const m of text.matchAll(SESSION_COOKIE)) if (!m[2].startsWith(REDACTED)) leaks.push(m[1]);
  return leaks;
}

function reportFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...reportFiles(p));
    else if (/\.(json|html)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Caviarde sur place tous les .json/.html du dossier (récursif). Renvoie le nombre de fichiers modifiés. */
function redactDir(dir) {
  let changed = 0;
  for (const file of reportFiles(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    const next = redactText(text);
    if (next !== text) { fs.writeFileSync(file, next); changed++; }
  }
  return changed;
}

/** Fichiers contenant encore un cookie ou un en-tête sensible. */
function scanDir(dir) {
  return reportFiles(dir).map((file) => ({ file, leaks: findLeaks(fs.readFileSync(file, 'utf8')) })).filter((r) => r.leaks.length);
}

module.exports = { REDACTED, redactText, findLeaks, redactDir, scanDir };

if (require.main === module) {
  const dirs = process.argv.slice(2);
  const targets = dirs.length ? dirs : [path.resolve(__dirname, '../reports/lighthouse')];
  const leaks = targets.flatMap(scanDir);
  for (const { file, leaks: l } of leaks) console.error(`✗ secret résiduel dans ${file} : ${l.join(', ')}`);
  if (leaks.length) process.exit(1);
  console.log(`✓ aucun cookie/en-tête sensible dans ${targets.join(', ')}`);
}
