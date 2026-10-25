/**
 * Garde de port pour les audits a11y/Lighthouse : garantit qu'aucun serveur
 * (dev ou preview obsolète) n'écoute sur le port avant de lancer le build
 * courant, sur TOUTES les interfaces de bouclage — IPv4 (127.0.0.1, 0.0.0.0)
 * comme IPv6 ([::1], [::]). Un serveur oublié sur [::1] répondait auparavant à
 * « localhost » et faisait auditer un ancien build (lsof absent → aucun kill).
 */

const { execSync } = require('node:child_process');
const net = require('node:net');

/** Hôtes sondés : couvre 127.0.0.1/0.0.0.0 (IPv4) et ::1/:: (IPv6). */
const PROBE_HOSTS = ['127.0.0.1', '::1'];

/** Extrait les PID d'une sortie `ss -ltnpH` (`users:(("node",pid=123,fd=21))`). */
function parseSsPids(output) {
  return [...new Set([...String(output).matchAll(/pid=(\d+)/g)].map((m) => Number(m[1])))];
}

/** Extrait les PID d'une sortie `lsof -ti` ou `fuser` (entiers séparés par des blancs). */
function parseNumericPids(output) {
  return [...new Set(String(output).split(/\s+/).filter((t) => /^\d+$/.test(t)).map(Number))];
}

function tryExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: true });
  } catch (e) {
    return e && typeof e.stdout === 'string' ? e.stdout : '';
  }
}

/** PID qui écoutent sur `port` (toutes familles d'adresses), via ss, lsof ou fuser selon disponibilité. */
function listeningPids(port) {
  if (process.platform === 'win32') {
    const out = tryExec(`netstat -ano | findstr :${port} | findstr LISTENING`);
    return [...new Set(out.trim().split('\n').map((l) => Number(l.trim().split(/\s+/).pop())).filter(Boolean))];
  }
  const pids = new Set([
    ...parseSsPids(tryExec(`ss -ltnpH 'sport = :${port}'`)),
    ...parseNumericPids(tryExec(`lsof -ti tcp:${port} -sTCP:LISTEN`)),
    ...parseNumericPids(tryExec(`fuser -n tcp ${port} 2>/dev/null`)),
  ]);
  return [...pids].filter((pid) => pid !== process.pid);
}

/** Vrai si une connexion TCP aboutit sur host:port. */
function isPortOpen(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (open) => { socket.destroy(); resolve(open); };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** Hôtes (parmi PROBE_HOSTS) sur lesquels le port répond encore. */
async function openHosts(port, hosts = PROBE_HOSTS) {
  const results = await Promise.all(hosts.map(async (h) => [h, await isPortOpen(h, port)]));
  return results.filter(([, open]) => open).map(([h]) => h);
}

/**
 * Libère le port : tue les écouteurs trouvés puis vérifie, en IPv4 et IPv6,
 * que plus rien ne répond. Lève une erreur sinon (on n'audite jamais un
 * serveur qu'on n'a pas lancé).
 */
async function ensurePortFree(port, { log = () => {}, kill = (pid) => process.kill(pid, 'SIGKILL'), waitMs = 2000 } = {}) {
  const pids = listeningPids(port);
  for (const pid of pids) {
    log(`Killing process ${pid} listening on port ${port}...`);
    try { kill(pid); } catch { /* déjà terminé */ }
  }
  const deadline = Date.now() + waitMs;
  let still = await openHosts(port);
  while (still.length && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    still = await openHosts(port);
  }
  if (still.length) {
    throw new Error(`Port ${port} still in use on ${still.join(', ')} — stop that server before running the audits.`);
  }
}

module.exports = { PROBE_HOSTS, parseSsPids, parseNumericPids, listeningPids, isPortOpen, openHosts, ensurePortFree };
