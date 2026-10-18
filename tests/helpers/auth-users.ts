/**
 * Helpers d'utilisateurs de test (repris de moda `tests/vitest/utils/auth-api.ts`,
 * adaptés au schéma Polyweb).
 */
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDrizzle, schema } from '@database/drizzle';

export interface TestUser { id: string; email: string; password: string; name: string }

export async function createVerifiedUser(label: string, role?: string): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@test.polyweb.local`;
  const password = `P0lyweb!${randomUUID().slice(0, 8)}`;
  const name = `Test ${label}`;
  const res = await auth.api.signUpEmail({ body: { email, password, name } });
  await getDrizzle().update(schema.user).set({ emailVerified: true, ...(role ? { role } : {}) }).where(eq(schema.user.id, res.user.id));
  return { id: res.user.id, email, password, name };
}

export async function signInCookie(email: string, password: string): Promise<string> {
  const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

export async function removeUsers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await getDrizzle().delete(schema.user).where(inArray(schema.user.id, ids));
}
