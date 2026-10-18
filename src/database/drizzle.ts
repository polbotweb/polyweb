import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import * as schema from './schemas';
import { getDbUrl, getPoolConfig } from './env';

export type DrizzleDB = NodePgDatabase<typeof schema>;
export interface DbActorContext {
  userId: string | null;
  isAdmin?: boolean;
}

// ─── Pool singleton ──────────────────────────────────────────────────
let instance: { pool: Pool; db: DrizzleDB; isHealthy: boolean } | null = null;

function buildPgStartupOptions(statementTimeout?: number, idleInTransactionTimeout?: number): string | undefined {
  const options: string[] = [];

  if (statementTimeout) {
    options.push(`-c statement_timeout=${Number(statementTimeout)}`);
  }

  if (idleInTransactionTimeout) {
    options.push(`-c idle_in_transaction_session_timeout=${Number(idleInTransactionTimeout)}`);
  }

  return options.length > 0 ? options.join(' ') : undefined;
}

function createPool(): { pool: Pool; db: DrizzleDB; isHealthy: boolean } {
  const url = getDbUrl();
  const poolConfig = getPoolConfig();

  // Extract non-standard pool options before passing to pg.
  // Session timeouts are applied at connection startup to avoid racing the
  // first query with an async client.query() inside Pool.on('connect').
  const { statement_timeout, idle_in_transaction_session_timeout, ...pgPoolConfig } = poolConfig;

  const p = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require')
      ? { rejectUnauthorized: true, ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT } : {}) }
      : undefined,
    options: buildPgStartupOptions(statement_timeout, idle_in_transaction_session_timeout),
    ...pgPoolConfig,
  });

  const entry = { pool: p, db: drizzle(p, { schema }), isHealthy: true };

  p.on('error', (err) => {
    console.error('[DB] Erreur de pool inattendue:', err.stack ?? err.message);
    entry.isHealthy = false;
  });

  return entry;
}

function getPool(): Pool {
  if (instance && instance.isHealthy) return instance.pool;

  if (instance && !instance.isHealthy) {
    console.warn('[DB] Pool marked unhealthy — recreating');
    instance.pool.end().catch((err) => {
      console.error('[DB] Error ending unhealthy pool:', err);
    });
    instance = null;
  }

  instance = createPool();
  return instance.pool;
}

// ─── Public API ──────────────────────────────────────────────────────
export function getDrizzle(): DrizzleDB {
  if (instance) return instance.db;
  getPool(); // initializes instance
  return instance!.db;
}

/**
 * Returns a Proxy that always delegates to the current Drizzle instance.
 * Use this when you need a long-lived reference that survives pool recreation
 * (e.g. for better-auth's drizzleAdapter which captures db at init time).
 */
export function getLazyDrizzle(): DrizzleDB {
  return new Proxy({} as DrizzleDB, {
    get(_target, prop, receiver) {
      const current = getDrizzle();
      const value = Reflect.get(current, prop, receiver);
      return typeof value === 'function' ? value.bind(current) : value;
    },
  });
}

export async function getPgClient(): Promise<PoolClient> {
  return getPool().connect();
}

/**
 * Execute a block with per-request SQL context stored in LOCAL settings.
 *
 * This is the foundation required for future PostgreSQL RLS policies.
 * The settings live only for the current transaction and never leak back to
 * the pool once the client is released.
 *
 * Includes a per-transaction statement_timeout (default 30 s) to prevent
 * runaway queries from holding a connection indefinitely.
 */
export async function withDbActorContext<T>(
  actor: DbActorContext,
  fn: (db: DrizzleDB, client: PoolClient) => Promise<T>,
  options?: { statementTimeoutMs?: number },
): Promise<T> {
  const client = await getPgClient();
  const db = drizzle(client, { schema });
  const raw = options?.statementTimeoutMs ?? 30_000;
  const timeout = Number.isFinite(raw) ? Math.max(1000, Math.min(300_000, raw)) : 30_000;

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = $1`, [`${timeout}`]);
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', actor.userId ?? '']);
    await client.query('SELECT set_config($1, $2, true)', ['app.is_admin', actor.isAdmin ? 'true' : 'false']);

    const result = await fn(db, client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[DB] Failed to rollback actor-context transaction:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function checkConnection(): Promise<{ ok: boolean; latency: number; error?: unknown }> {
  const start = Date.now();
  try {
    const client = await getPgClient();
    try {
      await client.query('SELECT 1');
      return { ok: true, latency: Date.now() - start };
    } catch (err) {
      return { ok: false, latency: Date.now() - start, error: err };
    } finally {
      client.release();
    }
  } catch (err) {
    return { ok: false, latency: Date.now() - start, error: err };
  }
}

export async function shutdownDb(): Promise<void> {
  const { shutdownCache } = await import('./cache');
  shutdownCache();
  if (instance) {
    await instance.pool.end();
    instance = null;
  }
}

// Graceful shutdown — drain the pool on process termination signals
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[DB] Received ${signal} — closing pool`);
    shutdownDb()
      .catch((err) => console.error('[DB] Error during shutdown:', err))
      .finally(() => process.exit(0));
  });
}

export { schema };