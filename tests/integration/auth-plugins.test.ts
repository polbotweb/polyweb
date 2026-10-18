/**
 * Tests des plugins Better Auth (admin, organization) — portés depuis moda
 * `tests/vitest/auth/{admin-plugin,organization-plugin}.test.ts`.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { APIError } from 'better-auth/api';
import { auth } from '@/lib/auth';
import { getDrizzle, schema } from '@database/drizzle';
import { createVerifiedUser, signInCookie, removeUsers } from '../helpers/auth-users';

const created: string[] = [];
const orgs: string[] = [];
afterAll(async () => {
  for (const id of orgs) await getDrizzle().delete(schema.organization).where(eq(schema.organization.id, id));
  await removeUsers(created);
});

async function user(label: string, role?: string) {
  const u = await createVerifiedUser(label, role);
  created.push(u.id);
  return u;
}

describe('Better Auth — admin plugin', () => {
  it('admin can set a role and find it via listUsers', async () => {
    const admin = await user('admin-role', 'admin');
    const target = await user('role-target');
    const headers = new Headers({ cookie: await signInCookie(admin.email, admin.password) });
    const res = await auth.api.setRole({ body: { userId: target.id, role: 'editor' }, headers });
    expect(res.user.role).toContain('editor');
    const listed = await auth.api.listUsers({ headers, query: { searchField: 'email', searchValue: target.email } });
    expect(listed.users.find((u) => u.id === target.id)?.role).toContain('editor');
  });

  it('admin can ban and unban a user to control access', async () => {
    const admin = await user('admin-ban', 'admin');
    const target = await user('ban-target');
    const headers = new Headers({ cookie: await signInCookie(admin.email, admin.password) });
    await auth.api.banUser({ body: { userId: target.id, banReason: 'test' }, headers });
    await expect(auth.api.signInEmail({ body: { email: target.email, password: target.password } })).rejects.toThrowError(APIError);
    await auth.api.unbanUser({ body: { userId: target.id }, headers });
    const signIn = await auth.api.signInEmail({ body: { email: target.email, password: target.password } });
    expect(signIn.user.email).toBe(target.email);
  });

  it('a regular user cannot change roles', async () => {
    const regular = await user('regular');
    const target = await user('regular-target');
    const headers = new Headers({ cookie: await signInCookie(regular.email, regular.password) });
    await expect(auth.api.setRole({ body: { userId: target.id, role: 'admin' }, headers })).rejects.toThrowError(APIError);
  });

  it('RBAC: editor can manage content entries but not API tokens', async () => {
    const editor = await user('editor-rbac', 'editor');
    const allowed = await auth.api.userHasPermission({ body: { userId: editor.id, permissions: { contentEntry: ['publish'] } } });
    const denied = await auth.api.userHasPermission({ body: { userId: editor.id, permissions: { apiToken: ['create'] } } });
    expect(allowed.success).toBe(true);
    expect(denied.success).toBe(false);
  });
});

describe('Better Auth — organization plugin', () => {
  it('creates an organization with the creator as owner and lists it', async () => {
    const owner = await user('org-owner');
    const headers = new Headers({ cookie: await signInCookie(owner.email, owner.password) });
    const slug = `org-${randomUUID().slice(0, 8)}`;
    const org = await auth.api.createOrganization({ body: { name: 'Org test', slug }, headers });
    expect(org?.slug).toBe(slug);
    orgs.push(org!.id);
    const full = await auth.api.getFullOrganization({ query: { organizationId: org!.id }, headers });
    expect(full?.members.find((m) => m.userId === owner.id)?.role).toBe('owner');
    const list = await auth.api.listOrganizations({ headers });
    expect(list.some((o) => o.id === org!.id)).toBe(true);
  });

  it('owner can invite a member, and a non-member cannot read the organization', async () => {
    const owner = await user('org-owner2');
    const outsider = await user('org-outsider');
    const headers = new Headers({ cookie: await signInCookie(owner.email, owner.password) });
    const org = await auth.api.createOrganization({ body: { name: 'Org 2', slug: `org2-${randomUUID().slice(0, 8)}` }, headers });
    orgs.push(org!.id);
    const invitation = await auth.api.createInvitation({ body: { email: outsider.email, role: 'member', organizationId: org!.id }, headers });
    expect(invitation.status).toBe('pending');
    const outsiderHeaders = new Headers({ cookie: await signInCookie(outsider.email, outsider.password) });
    await expect(auth.api.getFullOrganization({ query: { organizationId: org!.id }, headers: outsiderHeaders })).rejects.toThrowError(APIError);
  });
});
