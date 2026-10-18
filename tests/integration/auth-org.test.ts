import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestHelpers, auth } from '../helpers/auth';
import type { TestHelpers } from 'better-auth/plugins';

describe('Auth — Organization Advanced', () => {
  let test: TestHelpers;
  let ownerUser: any;
  let memberUser: any;
  let orgId: string;

  beforeAll(async () => {
    test = await getTestHelpers();

    const owner = test.createUser({
      email: `org-owner-${Date.now()}@test.com`,
      name: 'Org Owner',
      emailVerified: true,
    });
    ownerUser = await test.saveUser(owner);

    const member = test.createUser({
      email: `org-member-${Date.now()}@test.com`,
      name: 'Org Member',
      emailVerified: true,
    });
    memberUser = await test.saveUser(member);

    // Create the org
    const ownerHeaders = await test.getAuthHeaders({ userId: ownerUser.id });
    const org = await auth.api.createOrganization({
      body: { name: 'Adv Org Test', slug: `adv-org-${Date.now()}` },
      headers: ownerHeaders,
    });
    orgId = org.id;
  });

  afterAll(async () => {
    if (orgId) {
      const headers = await test.getAuthHeaders({ userId: ownerUser.id });
      await auth.api.deleteOrganization({
        body: { organizationId: orgId },
        headers,
      }).catch(() => {});
    }
    if (memberUser?.id) await test.deleteUser(memberUser.id).catch(() => {});
    if (ownerUser?.id) await test.deleteUser(ownerUser.id).catch(() => {});
  });

  it('owner can update organization name', async () => {
    const headers = await test.getAuthHeaders({ userId: ownerUser.id });
    const updated = await auth.api.updateOrganization({
      body: { data: { name: 'Renamed Org' }, organizationId: orgId },
      headers,
    });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Renamed Org');
  });

  it('owner can invite a member', async () => {
    const headers = await test.getAuthHeaders({ userId: ownerUser.id });
    const invitation = await auth.api.createInvitation({
      body: {
        email: memberUser.email,
        role: 'member',
        organizationId: orgId,
      },
      headers,
    });
    expect(invitation).toBeDefined();
    expect(invitation.id).toBeTruthy();
    expect(invitation.email).toBe(memberUser.email);
    expect(invitation.status).toBe('pending');
  });

  it('invited user can accept invitation', async () => {
    // Find the invitation
    const { getDrizzle, schema } = await import('@database/drizzle');
    const { eq, and } = await import('drizzle-orm');
    const db = getDrizzle();

    const [inv] = await db
      .select()
      .from(schema.invitation)
      .where(
        and(
          eq(schema.invitation.email, memberUser.email),
          eq(schema.invitation.organizationId, orgId),
        ),
      );
    expect(inv).toBeDefined();

    const memberHeaders = await test.getAuthHeaders({ userId: memberUser.id });
    await auth.api.acceptInvitation({
      body: { invitationId: inv.id },
      headers: memberHeaders,
    });

    // Verify member is in the org
    const members = await auth.api.getFullOrganization({
      query: { organizationId: orgId },
      headers: memberHeaders,
    });
    expect(members).toBeDefined();
    const memberList = (members as any).members ?? [];
    const found = memberList.find((m: any) => m.userId === memberUser.id);
    expect(found).toBeDefined();
  });

  it('owner can remove a member', async () => {
    const headers = await test.getAuthHeaders({ userId: ownerUser.id });

    // Get memberId
    const full = await auth.api.getFullOrganization({
      query: { organizationId: orgId },
      headers,
    });
    const memberList = (full as any).members ?? [];
    const memberEntry = memberList.find((m: any) => m.userId === memberUser.id);
    expect(memberEntry).toBeDefined();

    await auth.api.removeMember({
      body: { memberIdOrEmail: memberEntry.id, organizationId: orgId },
      headers,
    });

    // Verify gone
    const after = await auth.api.getFullOrganization({
      query: { organizationId: orgId },
      headers,
    });
    const afterMembers = (after as any).members ?? [];
    const gone = afterMembers.find((m: any) => m.userId === memberUser.id);
    expect(gone).toBeUndefined();
  });

  it('deleted organization disappears from list', async () => {
    const headers = await test.getAuthHeaders({ userId: ownerUser.id });

    // Create a throwaway org to delete
    const tempOrg = await auth.api.createOrganization({
      body: { name: 'Temp Org', slug: `temp-${Date.now()}` },
      headers,
    });
    expect(tempOrg.id).toBeTruthy();

    await auth.api.deleteOrganization({
      body: { organizationId: tempOrg.id },
      headers,
    });

    const orgs = await auth.api.listOrganizations({ headers });
    const found = orgs.find((o: any) => o.id === tempOrg.id);
    expect(found).toBeUndefined();
  });
});
