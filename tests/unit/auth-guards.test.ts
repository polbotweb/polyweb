import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@i18n/utils', () => ({
  toLocale: vi.fn((lang?: string) => lang ?? 'en'),
  getAuthTranslations: vi.fn(async () => ({
    routes: { 'sign-in': 'sign-in', dashboard: 'dashboard' },
  })),
}));

import { requireAuth, requireAdmin } from '@lib/auth-guards';

function createAstro(user: any = null, lang = 'en') {
  const redirects: string[] = [];
  return {
    ctx: {
      params: { lang },
      locals: { user } as App.Locals,
      redirect: (url: string) => {
        redirects.push(url);
        return new Response(null, { status: 302, headers: { Location: url } });
      },
    },
    redirects,
  };
}

describe('requireAuth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects unauthenticated user to sign-in', async () => {
    const { ctx, redirects } = createAstro(null);
    const result = await requireAuth(ctx);

    expect(result).toHaveProperty('redirect');
    expect(redirects[0]).toContain('sign-in');
  });

  it('returns user when authenticated', async () => {
    const user = { id: 'u1', role: 'user', email: 'test@test.com' };
    const { ctx } = createAstro(user);
    const result = await requireAuth(ctx);

    expect(result).toHaveProperty('user');
    expect((result as any).user.id).toBe('u1');
  });
});

describe('requireAdmin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects unauthenticated user to sign-in', async () => {
    const { ctx, redirects } = createAstro(null);
    const result = await requireAdmin(ctx);

    expect(result).toHaveProperty('redirect');
    expect(redirects[0]).toContain('sign-in');
  });

  it('redirects non-admin user to dashboard', async () => {
    const user = { id: 'u2', role: 'user', email: 'user@test.com' };
    const { ctx, redirects } = createAstro(user);
    const result = await requireAdmin(ctx);

    expect(result).toHaveProperty('redirect');
    expect(redirects[0]).toContain('dashboard');
  });

  it('returns user when admin', async () => {
    const admin = { id: 'a1', role: 'admin', email: 'admin@test.com' };
    const { ctx } = createAstro(admin);
    const result = await requireAdmin(ctx);

    expect(result).toHaveProperty('user');
    expect((result as any).user.role).toBe('admin');
  });
});
