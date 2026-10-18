/**
 * `AppConfig` service — typed, validated view of process.env.
 *
 * Read once when the runtime is built. Tests can provide their own layer with
 * `Layer.succeed(AppConfig, { ...defaults, ... })` or `appConfigFrom(env)`.
 */
import { Context, Layer } from 'effect';

export interface AppConfigShape {
  readonly nodeEnv: 'development' | 'production' | 'test';
  readonly siteUrl: string;
  readonly siteName: string;
  /** Secret used to sign preview links, webhook ids… (falls back to BETTER_AUTH_SECRET). */
  readonly signingSecret: string;
  readonly trustProxy: boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()('polyweb/AppConfig') {}

export function appConfigFrom(env: Record<string, string | undefined>): AppConfigShape {
  const nodeEnv = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  const siteUrl = (env.SITE_URL || env.BETTER_AUTH_URL || 'http://localhost:4321').replace(/\/$/, '');
  const signingSecret = env.POLYWEB_SIGNING_SECRET || env.BETTER_AUTH_SECRET || '';
  if (!signingSecret && nodeEnv === 'production') {
    // Fail fast at boot in production: signed links must not use a guessable key.
    throw new Error('POLYWEB_SIGNING_SECRET (or BETTER_AUTH_SECRET) must be set in production');
  }
  return {
    nodeEnv,
    siteUrl,
    siteName: env.SITE_NAME || 'Polyweb',
    signingSecret: signingSecret || 'polyweb-dev-insecure-secret',
    trustProxy: env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1',
    env,
  };
}

export const AppConfigLive = Layer.sync(AppConfig, () => appConfigFrom(process.env));
