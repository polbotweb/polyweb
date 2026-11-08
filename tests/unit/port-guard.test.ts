import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const guard = require('../helpers/port-guard.cjs') as {
  parseSsPids: (o: string) => number[];
  parseNumericPids: (o: string) => number[];
  openHosts: (port: number) => Promise<string[]>;
  ensurePortFree: (port: number, opts?: { waitMs?: number }) => Promise<void>;
};

/** Serveurs enfants lancés par les tests : toujours tués en afterEach pour qu'un échec d'assertion ne laisse pas Vitest bloqué. */
const children = new Set<ChildProcess>();

/** Lance un serveur HTTP enfant n'écoutant QUE sur [::1] (cas du preview oublié). */
function spawnIpv6Server(): Promise<{ port: number; exited: Promise<number | null> }> {
  const child = spawn(process.execPath, ['-e', "const s=require('http').createServer((q,r)=>r.end('stale'));s.listen(0,'::1',()=>console.log(s.address().port))"], { stdio: ['ignore', 'pipe', 'inherit'] });
  children.add(child);
  child.once('exit', () => children.delete(child));
  const exited = new Promise<number | null>((r) => child.once('exit', (code) => r(code)));
  return new Promise((resolve, reject) => {
    child.stdout!.once('data', (d) => resolve({ port: Number(String(d).trim()), exited }));
    child.once('error', reject);
  });
}

describe('a11y port guard', () => {
  afterEach(() => {
    for (const child of children) child.kill('SIGKILL');
    children.clear();
  });

  it('parses ss / lsof / fuser outputs', () => {
    expect(guard.parseSsPids('LISTEN 0 511 [::1]:4321 [::]:* users:(("node",pid=203459,fd=21),("node",pid=7,fd=3))')).toEqual([203459, 7]);
    expect(guard.parseNumericPids(' 123\n456 123 ')).toEqual([123, 456]);
    expect(guard.parseSsPids('')).toEqual([]);
  });

  it('detects and kills a stale listener bound only to IPv6 [::1]', async () => {
    const { port, exited } = await spawnIpv6Server();
    // Sur un box partagé, un autre process peut écouter brièvement sur 127.0.0.1 au même port
    // aléatoire : on exige seulement que l'écoute [::1] soit détectée, puis que le port soit libéré.
    expect(await guard.openHosts(port)).toContain('::1');
    await guard.ensurePortFree(port, { waitMs: 3000 });
    expect(await guard.openHosts(port)).not.toContain('::1');
    await exited;
  }, 15_000);
});
