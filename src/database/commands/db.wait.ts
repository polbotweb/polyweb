/**
 * db:wait — attend que PostgreSQL réponde (repris de les-rochers-blancs scripts/db-wait.ts,
 * adapté à `pg` + getDbUrl()). Utile dans Docker/devcontainer/CI avant db:migrate.
 *   DB_WAIT_MAX_ATTEMPTS (défaut 30), DB_WAIT_DELAY_MS (défaut 2000)
 */
import pg from 'pg';
import { getDbUrl, maskUrl } from '../env';

const maxAttempts = Number.parseInt(process.env.DB_WAIT_MAX_ATTEMPTS ?? '30', 10);
const delayMs = Number.parseInt(process.env.DB_WAIT_DELAY_MS ?? '2000', 10);

if (!Number.isFinite(maxAttempts) || maxAttempts < 1) { console.error('DB_WAIT_MAX_ATTEMPTS must be a positive integer'); process.exit(1); }
if (!Number.isFinite(delayMs) || delayMs < 0) { console.error('DB_WAIT_DELAY_MS must be a non-negative integer'); process.exit(1); }

const url = getDbUrl();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query('select 1');
    await client.end().catch(() => undefined);
    console.log(`Database reachable after ${attempt} attempt(s) (${maskUrl(url)}).`);
    process.exit(0);
  } catch (error) {
    await client.end().catch(() => undefined);
    if (attempt === maxAttempts) {
      console.error(`Database did not become reachable after ${maxAttempts} attempt(s).`);
      console.error((error as Error).message || String(error));
      process.exit(1);
    }
    console.log(`Waiting for database... (${attempt}/${maxAttempts})`);
    await sleep(delayMs);
  }
}
