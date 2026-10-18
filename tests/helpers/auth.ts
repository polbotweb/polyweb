/**
 * Shared test helper — provides better-auth testUtils context.
 *
 * Usage:
 *   import { getTestHelpers } from '../helpers/auth';
 *   const test = await getTestHelpers();
 */
import { auth } from '@/lib/auth';
import type { TestHelpers } from 'better-auth/plugins';

let _helpers: TestHelpers | null = null;

export async function getTestHelpers(): Promise<TestHelpers> {
  if (!_helpers) {
    const ctx = await auth.$context;
    _helpers = ctx.test;
  }
  return _helpers;
}

export { auth };
