import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────
vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  }
  return { ActionError, defineAction: (def: any) => def };
});

vi.mock('@database/cache', () => ({ invalidateCache: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));

const mockUserHasPermission = vi.fn(() => Promise.resolve({ success: true }));
const mockListOrgRoles = vi.fn(() => Promise.resolve([{ id: '', role: '', permission: {} as Record<string, unknown> }]));
const mockCreateOrgRole = vi.fn(() => Promise.resolve({ id: 'role-1', role: 'reviewer' }));
const mockUpdateOrgRole = vi.fn(() => Promise.resolve({ id: 'role-1', role: 'reviewer-v2' }));
const mockDeleteOrgRole = vi.fn(() => Promise.resolve({ success: true }));
const mockUpdateMemberRole = vi.fn(() => Promise.resolve({ success: true }));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      userHasPermission: mockUserHasPermission,
      listOrgRoles: mockListOrgRoles,
      createOrgRole: mockCreateOrgRole,
      updateOrgRole: mockUpdateOrgRole,
      deleteOrgRole: mockDeleteOrgRole,
      updateMemberRole: mockUpdateMemberRole,
    },
  },
}));

// ── Imports ─────────────────────────────────────────────────────────
import {
  listOrgRoles as _list,
  createOrgRole as _create,
  updateOrgRole as _update,
  deleteOrgRole as _del,
  updateMemberRole as _memberRole,
} from '@/actions/admin/roles';

const listOrgRoles = _list as unknown as { input: any; handler: (...a: any[]) => Promise<any> };
const createOrgRole = _create as unknown as { input: any; handler: (...a: any[]) => Promise<any> };
const updateOrgRole = _update as unknown as { input: any; handler: (...a: any[]) => Promise<any> };
const deleteOrgRole = _del as unknown as { input: any; handler: (...a: any[]) => Promise<any> };
const updateMemberRole = _memberRole as unknown as { input: any; handler: (...a: any[]) => Promise<any> };

function adminCtx() {
  return {
    locals: { user: { id: 'admin-1', role: 'admin', email: 'a@test.com' } },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  } as any;
}

function userCtx() {
  return {
    locals: { user: { id: 'user-1', role: 'user', email: 'u@test.com' } },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  } as any;
}

function guestCtx() {
  return {
    locals: { user: null },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  } as any;
}

function bannedCtx() {
  return {
    locals: { user: { id: 'ban-1', role: 'admin', email: 'b@test.com', banned: true } },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  } as any;
}

const ORG_ID = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
  mockUserHasPermission.mockResolvedValue({ success: true });
});

describe('listOrgRoles', () => {
  it('lists roles for an organization', async () => {
    const mockRole = { id: 'r1', role: 'reviewer', permission: { create: true } };
    mockListOrgRoles.mockResolvedValue([mockRole]);
    const result = await listOrgRoles.handler({ organizationId: ORG_ID }, adminCtx());
    expect(result).toEqual([mockRole]);
    expect(mockListOrgRoles).toHaveBeenCalledWith(expect.objectContaining({
      query: { organizationId: ORG_ID },
    }));
  });

  it('rejects unauthenticated users', async () => {
    await expect(listOrgRoles.handler({ organizationId: ORG_ID }, guestCtx()))
      .rejects.toThrow('connecté');
  });

  it('rejects banned users', async () => {
    await expect(listOrgRoles.handler({ organizationId: ORG_ID }, bannedCtx()))
      .rejects.toThrow('suspendu');
  });

  it('rejects users without permission', async () => {
    await expect(listOrgRoles.handler({ organizationId: ORG_ID }, userCtx()))
      .rejects.toThrow('administrateurs');
  });
});

describe('createOrgRole', () => {
  const input = {
    organizationId: ORG_ID,
    role: 'reviewer',
    permission: { page: ['read'] },
  };

  it('creates a role successfully', async () => {
    const result = await createOrgRole.handler(input, adminCtx());
    expect(result).toEqual({ id: 'role-1', role: 'reviewer' });
    expect(mockCreateOrgRole).toHaveBeenCalledWith(expect.objectContaining({
      body: { role: 'reviewer', permission: { page: ['read'] }, organizationId: ORG_ID },
    }));
  });

  it('rejects unauthenticated users', async () => {
    await expect(createOrgRole.handler(input, guestCtx()))
      .rejects.toThrow('connecté');
  });

  it('rejects banned users', async () => {
    await expect(createOrgRole.handler(input, bannedCtx()))
      .rejects.toThrow('suspendu');
  });

  it('rejects users without permission', async () => {
    await expect(createOrgRole.handler(input, userCtx()))
      .rejects.toThrow('administrateurs');
  });

  it('wraps better-auth errors as BAD_REQUEST', async () => {
    mockCreateOrgRole.mockRejectedValue(new Error('Role already exists'));
    await expect(createOrgRole.handler(input, adminCtx()))
      .rejects.toThrow('Role already exists');
  });
});

describe('updateOrgRole', () => {
  const input = {
    organizationId: ORG_ID,
    roleId: 'role-1',
    data: { roleName: 'reviewer-v2', permission: { page: ['read', 'update'] } },
  };

  it('updates a role successfully', async () => {
    const result = await updateOrgRole.handler(input, adminCtx());
    expect(result).toEqual({ id: 'role-1', role: 'reviewer-v2' });
    expect(mockUpdateOrgRole).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ roleId: 'role-1', organizationId: ORG_ID }),
    }));
  });

  it('rejects unauthenticated users', async () => {
    await expect(updateOrgRole.handler(input, guestCtx()))
      .rejects.toThrow('connecté');
  });

  it('rejects users without permission', async () => {
    await expect(updateOrgRole.handler(input, userCtx()))
      .rejects.toThrow('administrateurs');
  });

  it('wraps better-auth errors as BAD_REQUEST', async () => {
    mockUpdateOrgRole.mockRejectedValue(new Error('Role not found'));
    await expect(updateOrgRole.handler(input, adminCtx()))
      .rejects.toThrow('Role not found');
  });
});

describe('deleteOrgRole', () => {
  const input = { organizationId: ORG_ID, roleId: 'role-1' };

  it('deletes a role successfully', async () => {
    const result = await deleteOrgRole.handler(input, adminCtx());
    expect(result).toEqual({ success: true });
    expect(mockDeleteOrgRole).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ roleId: 'role-1', organizationId: ORG_ID }),
    }));
  });

  it('rejects unauthenticated users', async () => {
    await expect(deleteOrgRole.handler(input, guestCtx()))
      .rejects.toThrow('connecté');
  });

  it('rejects users without permission', async () => {
    await expect(deleteOrgRole.handler(input, userCtx()))
      .rejects.toThrow('administrateurs');
  });

  it('wraps better-auth errors as BAD_REQUEST', async () => {
    mockDeleteOrgRole.mockRejectedValue(new Error('Cannot delete'));
    await expect(deleteOrgRole.handler(input, adminCtx()))
      .rejects.toThrow('Cannot delete');
  });
});

describe('updateMemberRole', () => {
  const input = { memberId: 'member-1', role: 'admin' };

  it('updates a member role successfully', async () => {
    const result = await updateMemberRole.handler(input, adminCtx());
    expect(result).toEqual({ success: true });
    expect(mockUpdateMemberRole).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ memberId: 'member-1', role: 'admin' }),
    }));
  });

  it('accepts an array of roles', async () => {
    await updateMemberRole.handler({ memberId: 'member-1', role: ['admin', 'editor'] }, adminCtx());
    expect(mockUpdateMemberRole).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ role: ['admin', 'editor'] }),
    }));
  });

  it('rejects unauthenticated users', async () => {
    await expect(updateMemberRole.handler(input, guestCtx()))
      .rejects.toThrow('connecté');
  });

  it('rejects users without permission', async () => {
    await expect(updateMemberRole.handler(input, userCtx()))
      .rejects.toThrow('administrateurs');
  });
});
