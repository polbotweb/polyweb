import { beforeEach, describe, it, expect, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const mockExecute = vi.fn();
const mockSelect = vi.fn();

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    execute: mockExecute,
    select: mockSelect,
  })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({
    allowed: true,
    remaining: 59,
    resetAt: Date.now() + 60_000,
  })),
}));

import { GET, buildTsQuery, getRegconfig } from '@/pages/api/search';

function makeOrganizationQuery(rows: Array<{ id: string }>) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

beforeEach(() => {
  mockExecute.mockReset().mockResolvedValue({ rows: [] });
  mockSelect.mockReset();
});

// ─── Tests ──────────────────────────────────────────────────────────

describe('getRegconfig', () => {
  it('returns french for fr', () => {
    expect(getRegconfig('fr')).toBe('french');
  });

  it('returns english for en', () => {
    expect(getRegconfig('en')).toBe('english');
  });

  it('returns spanish for es', () => {
    expect(getRegconfig('es')).toBe('spanish');
  });

  it('returns simple for ar (no PG stemmer)', () => {
    expect(getRegconfig('ar')).toBe('simple');
  });

  it('returns simple for unknown locale', () => {
    expect(getRegconfig('ja')).toBe('simple');
  });
});

describe('buildTsQuery', () => {
  it('builds a simple single-word query with prefix match', () => {
    expect(buildTsQuery('hello')).toBe('hello:*');
  });

  it('builds a multi-word query with AND + prefix on last word', () => {
    expect(buildTsQuery('hello world')).toBe('hello & world:*');
  });

  it('handles three words', () => {
    expect(buildTsQuery('astro cms search')).toBe('astro & cms & search:*');
  });

  it('strips tsquery operators from input', () => {
    expect(buildTsQuery("hello & | ! ( ) ' : < > world")).toBe('hello & world:*');
  });

  it('strips backslashes', () => {
    expect(buildTsQuery('test\\injection')).toBe('testinjection:*');
  });

  it('returns null for empty string', () => {
    expect(buildTsQuery('')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(buildTsQuery('   ')).toBeNull();
  });

  it('returns null for string of only operators', () => {
    expect(buildTsQuery('& | ! ()')).toBeNull();
  });

  it('handles extra whitespace between words', () => {
    expect(buildTsQuery('  hello   world  ')).toBe('hello & world:*');
  });

  it('handles single character tokens after cleanup', () => {
    expect(buildTsQuery('a b c')).toBe('a & b & c:*');
  });

  it('handles mixed valid and invalid tokens', () => {
    expect(buildTsQuery('| hello & world !')).toBe('hello & world:*');
  });

  it('handles unicode characters', () => {
    expect(buildTsQuery('café résumé')).toBe('café & résumé:*');
  });

  it('handles Arabic text', () => {
    expect(buildTsQuery('مرحبا العالم')).toBe('مرحبا & العالم:*');
  });
});

describe('GET blog publication scope', () => {
  it('uses IS NULL for global posts and excludes future publications', async () => {
    const response = await GET({
      url: new URL('https://atomic.test/api/search?q=atomic&locale=fr'),
      clientAddress: '203.0.113.1',
    } as any);

    expect(response.status).toBe(200);
    const query = new PgDialect().sqlToQuery(mockExecute.mock.calls[0][0]);
    expect(query.sql).toContain('bp.organization_id IS NULL');
    expect(query.sql).toContain('bp.status = $');
    expect(query.params).toContain('PUBLISHED');
    expect(query.sql).toContain('bp.published_at <= now()');
  });

  it('uses an equality parameter, never IS, for an organization id', async () => {
    mockSelect.mockReturnValueOnce(makeOrganizationQuery([{ id: 'org-1' }]));

    const response = await GET({
      url: new URL('https://atomic.test/api/search?q=atomic&locale=en&org=acme'),
      clientAddress: '203.0.113.2',
    } as any);

    expect(response.status).toBe(200);
    const query = new PgDialect().sqlToQuery(mockExecute.mock.calls[0][0]);
    expect(query.sql).toContain('bp.organization_id = $');
    expect(query.sql).not.toMatch(/bp\.organization_id IS ['"]/);
    expect(query.params).toContain('org-1');
    expect(query.params).toContain('PUBLISHED');
    expect(query.sql).toContain('bp.published_at <= now()');
  });
});
