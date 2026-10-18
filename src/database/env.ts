import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

// ─── Types ───────────────────────────────────────────────────────────
export type DbEnv = 'PROD' | 'TEST' | 'LOCAL';

export interface PoolConfig {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  allowExitOnIdle?: boolean;
  /** Per-connection statement timeout (ms). Kills queries exceeding this. */
  statement_timeout?: number;
  /** Abort transactions idle longer than this (ms). Prevents connection starvation. */
  idle_in_transaction_session_timeout?: number;
}

export interface DbConfig {
  env: DbEnv;
  url: string;
  poolConfig: PoolConfig;
}

// ─── Constants ───────────────────────────────────────────────────────
const DB_ENVS: DbEnv[] = ['PROD', 'TEST', 'LOCAL'];

const ENV_VAR_MAP: Record<DbEnv, string> = {
  PROD: 'DATABASE_URL_PROD',
  TEST: 'DATABASE_URL_TEST',
  LOCAL: 'DATABASE_URL_LOCAL',
};

const POOL_CONFIGS: Record<DbEnv, PoolConfig> = {
  PROD: {
    max: Math.min(Math.max(parseInt(process.env.DB_POOL_MAX ?? '20', 10) || 20, 1), 100),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 60_000,
  },
  TEST: {
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 30_000,
  },
  LOCAL: {
    max: 10,
    idleTimeoutMillis: 15_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 60_000,
  },
};

const CONNECTION_LABELS: Record<DbEnv, string> = {
  PROD: 'production',
  TEST: 'test',
  LOCAL: 'local/dev',
};

// ─── Active environment (single source of truth) ────────────────────
const ACTIVE_ENV: DbEnv = (() => {
  const raw = process.env.DB_ENV;

  // DB_ENV absent du .env
  if (raw === undefined) {
    console.warn(`\x1b[33m⚠️  DB_ENV non défini dans .env — défaut : LOCAL\x1b[0m`);
    console.warn(`\x1b[2m   Ajoutez DB_ENV=LOCAL|PROD|TEST dans votre fichier .env\x1b[0m`);
    return 'LOCAL';
  }

  // DB_ENV= (présent mais vide)
  if (raw.trim() === '') {
    console.warn(`\x1b[33m⚠️  DB_ENV est vide dans .env — défaut : LOCAL\x1b[0m`);
    console.warn(`\x1b[2m   Valeurs acceptées : ${DB_ENVS.join(', ')}\x1b[0m`);
    return 'LOCAL';
  }

  const normalized = raw.trim().toUpperCase();
  if (DB_ENVS.includes(normalized as DbEnv)) return normalized as DbEnv;

  // DB_ENV contient une valeur invalide
  throw new Error(
    `❌ DB_ENV invalide : "${raw}". Valeurs acceptées : ${DB_ENVS.join(', ')}. Vérifiez votre fichier .env`
  );
})();

// ─── Lazy URL resolution (only resolves the env you ask for) ────────
function resolveUrl(env: DbEnv): string {
  const varName = ENV_VAR_MAP[env];
  const url = process.env[varName];
  if (!url) {
    throw new Error(
      `❌ Variable d'environnement manquante : ${varName} (environnement : ${env}). Ajoutez ${varName}=postgresql://... dans votre fichier .env`
    );
  }
  return url;
}

// ─── Public API ─────────────────────────────────────────────────────
export const getDbEnv = (): DbEnv => ACTIVE_ENV;
export const isProd = (): boolean => ACTIVE_ENV === 'PROD';
export const isTest = (): boolean => ACTIVE_ENV === 'TEST';
export const isLocal = (): boolean => ACTIVE_ENV === 'LOCAL';

export const getDbUrl = (env?: DbEnv): string => resolveUrl(env ?? ACTIVE_ENV);
export const getPoolConfig = (env?: DbEnv): PoolConfig => POOL_CONFIGS[env ?? ACTIVE_ENV];
export const getConnectionLabel = (env?: DbEnv): string => CONNECTION_LABELS[env ?? ACTIVE_ENV];

export function getDbConfig(env?: DbEnv): DbConfig {
  const target = env ?? ACTIVE_ENV;
  return {
    env: target,
    url: resolveUrl(target),
    poolConfig: POOL_CONFIGS[target],
  };
}

/** Masque les credentials dans une URL pour les logs */
export function maskUrl(url: string): string {
  return url.replace(/:\/\/[^@]+@/, '://***@');
}

/** Extrait le nom de la base depuis une URL postgres */
export function dbNameFromUrl(url: string): string {
  try { return new URL(url).pathname.replace(/^\//, ''); }
  catch { return url.split('/').pop() ?? 'unknown'; }
}