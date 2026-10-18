/**
 * Playwright global setup — seeds a verified test user in the DB
 * so that E2E sign-in flows work with requireEmailVerification: true.
 *
 * Flow: signUpEmail (creates user + hashes password) → force emailVerified in DB.
 */

export const SEED_EMAIL = 'e2e-seed@test.com';
export const SEED_PASSWORD = 'E2eTest1234!';
export const SEED_NAME = 'E2E Seed User';

export default async function globalSetup() {
  process.env.NODE_ENV = 'test';

  const { auth } = await import('../../src/lib/auth');
  const { getDrizzle, schema } = await import('../../src/database/drizzle');
  const { eq } = await import('drizzle-orm');
  const db = getDrizzle();

  // Clean up previous runs
  const existing = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, SEED_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    // Delete account + session rows first (FK), then user
    await db.delete(schema.account).where(eq(schema.account.userId, existing[0].id)).catch(() => {});
    await db.delete(schema.session).where(eq(schema.session.userId, existing[0].id)).catch(() => {});
    await db.delete(schema.user).where(eq(schema.user.id, existing[0].id)).catch(() => {});
  }

  // signUpEmail creates the user AND hashes the password correctly
  await auth.api.signUpEmail({
    body: { email: SEED_EMAIL, password: SEED_PASSWORD, name: SEED_NAME },
  });

  // Force emailVerified + admin role so sign-in and admin pages work
  await db
    .update(schema.user)
    .set({ emailVerified: true, role: 'admin' })
    .where(eq(schema.user.email, SEED_EMAIL));
}
