/**
 * A11y/Perf audit setup — creates seed users (regular + admin),
 * authenticates them, and exports session cookies for Pa11y-ci and Lighthouse CI.
 *
 * Run with: tsx tests/a11y/setup.ts [--teardown]
 */

import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:4321';
const COOKIES_PATH = resolve(import.meta.dirname, '../../.a11y-cookies.json');

export const SEED_USER = {
  email: 'a11y-seed@test.com',
  password: 'A11yTest1234!',
  name: 'A11y Seed User',
};

export const SEED_ADMIN = {
  email: 'a11y-admin@test.com',
  password: 'A11yAdmin1234!',
  name: 'A11y Admin User',
};

/** Delete a user and related rows by email */
async function deleteUser(email: string) {
  const { getDrizzle, schema } = await import('../../src/database/drizzle');
  const { eq } = await import('drizzle-orm');
  const db = getDrizzle();

  const existing = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);

  if (existing.length > 0) {
    const userId = existing[0].id;
    await db.delete(schema.account).where(eq(schema.account.userId, userId)).catch(() => {});
    await db.delete(schema.session).where(eq(schema.session.userId, userId)).catch(() => {});
    await db.delete(schema.user).where(eq(schema.user.id, userId)).catch(() => {});
  }
}

/** Create a verified user and return their session cookie */
async function createAndAuth(seed: { email: string; password: string; name: string }) {
  const { auth } = await import('../../src/lib/auth');
  const { getDrizzle, schema } = await import('../../src/database/drizzle');
  const { eq } = await import('drizzle-orm');
  const db = getDrizzle();

  // Clean up previous runs
  await deleteUser(seed.email);

  // Create user
  await auth.api.signUpEmail({
    body: { email: seed.email, password: seed.password, name: seed.name },
  });

  // Force email verification
  await db
    .update(schema.user)
    .set({ emailVerified: true })
    .where(eq(schema.user.email, seed.email));

  // Sign in via HTTP to get session cookie
  const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email: seed.email, password: seed.password }),
    redirect: 'manual',
  });

  const setCookie = response.headers.getSetCookie();
  if (!setCookie.length) {
    throw new Error(`No Set-Cookie header for ${seed.email}`);
  }

  // Extract cookie key=value pairs (drop attributes like Path, HttpOnly, etc.)
  const cookies = setCookie
    .map((h) => h.split(';')[0])
    .join('; ');

  return cookies;
}

async function setup() {
  process.env.NODE_ENV = 'test';

  console.log('[a11y] Creating seed users…');

  const userCookie = await createAndAuth(SEED_USER);
  const adminCookie = await createAndAuth(SEED_ADMIN);

  // Promote admin user
  await import('../../src/lib/auth');
  const { getDrizzle, schema } = await import('../../src/database/drizzle');
  const { eq } = await import('drizzle-orm');
  const db = getDrizzle();

  const adminRow = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, SEED_ADMIN.email))
    .limit(1);

  if (adminRow.length > 0) {
    await db
      .update(schema.user)
      .set({ role: 'admin' })
      .where(eq(schema.user.id, adminRow[0].id));
  }

  // Re-authenticate admin to get a session with the updated role
  const adminResponse = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email: SEED_ADMIN.email, password: SEED_ADMIN.password }),
    redirect: 'manual',
  });
  const adminSetCookie = adminResponse.headers.getSetCookie();
  const freshAdminCookie = adminSetCookie.length
    ? adminSetCookie.map((h) => h.split(';')[0]).join('; ')
    : adminCookie;

  const data = { userCookie, adminCookie: freshAdminCookie };
  writeFileSync(COOKIES_PATH, JSON.stringify(data, null, 2));
  console.log(`[a11y] Cookies written to ${COOKIES_PATH}`);
}

async function teardown() {
  process.env.NODE_ENV = 'test';

  console.log('[a11y] Cleaning up seed users…');
  await deleteUser(SEED_USER.email);
  await deleteUser(SEED_ADMIN.email);

  if (existsSync(COOKIES_PATH)) {
    unlinkSync(COOKIES_PATH);
  }
  console.log('[a11y] Teardown complete.');
}

// CLI entry point
const isTeardown = process.argv.includes('--teardown');
if (isTeardown) {
  teardown().catch((err) => { console.error(err); process.exit(1); });
} else {
  setup().catch((err) => { console.error(err); process.exit(1); });
}
