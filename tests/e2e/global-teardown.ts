/**
 * Playwright global teardown — removes the seed user and any leftover
 * fresh E2E users created during test runs.
 */
import { SEED_EMAIL } from './global-setup';

export default async function globalTeardown() {
  const { getDrizzle, schema } = await import('../../src/database/drizzle');
  const { eq, like } = await import('drizzle-orm');
  const db = getDrizzle();

  // Clean up seed user
  const existing = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, SEED_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    const userId = existing[0].id;
    await db.delete(schema.account).where(eq(schema.account.userId, userId)).catch(() => {});
    await db.delete(schema.session).where(eq(schema.session.userId, userId)).catch(() => {});
    await db.delete(schema.user).where(eq(schema.user.id, userId)).catch(() => {});
  }

  // Clean up fresh E2E users (e2e-{timestamp}@test.com)
  const freshUsers = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(like(schema.user.email, 'e2e-%@test.com'))
    .limit(50);

  for (const u of freshUsers) {
    await db.delete(schema.account).where(eq(schema.account.userId, u.id)).catch(() => {});
    await db.delete(schema.session).where(eq(schema.session.userId, u.id)).catch(() => {});
    await db.delete(schema.user).where(eq(schema.user.id, u.id)).catch(() => {});
  }
}
