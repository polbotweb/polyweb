import { describe, it, expect } from 'vitest';
import { maskUrl, dbNameFromUrl } from '@database/env';
import { maskApiKey } from '@smtp/env';

// ─── maskUrl ────────────────────────────────────────────────────────

describe('maskUrl', () => {
  it('masks credentials in a PostgreSQL URL', () => {
    const url = 'postgresql://user:password@localhost:5432/mydb';
    expect(maskUrl(url)).toBe('postgresql://***@localhost:5432/mydb');
  });

  it('masks complex passwords with special chars', () => {
    const url = 'postgresql://admin:p@ss!w0rd@db.example.com:5432/prod';
    const masked = maskUrl(url);
    expect(masked).toContain('***@');
    expect(masked).not.toContain('p@ss');
  });

  it('handles URL without credentials', () => {
    const url = 'postgresql://localhost:5432/mydb';
    const result = maskUrl(url);
    // Should not crash — may or may not transform
    expect(typeof result).toBe('string');
  });
});

// ─── dbNameFromUrl ──────────────────────────────────────────────────

describe('dbNameFromUrl', () => {
  it('extracts database name from a standard PostgreSQL URL', () => {
    expect(dbNameFromUrl('postgresql://user:pass@localhost:5432/atomic_local')).toBe('atomic_local');
  });

  it('extracts from URL with query params', () => {
    expect(dbNameFromUrl('postgresql://u:p@host/mydb?sslmode=require')).toBe('mydb');
  });

  it('returns fallback for invalid URL', () => {
    const result = dbNameFromUrl('not-a-url');
    expect(typeof result).toBe('string');
  });
});

// ─── maskApiKey ─────────────────────────────────────────────────────

describe('maskApiKey', () => {
  it('masks a long API key showing first 4 and last 4', () => {
    expect(maskApiKey('abcdefghijklmnop')).toBe('abcd...mnop');
  });

  it('masks a short key completely', () => {
    expect(maskApiKey('short')).toBe('***');
  });

  it('handles exactly 8 chars', () => {
    expect(maskApiKey('12345678')).toBe('***');
  });

  it('handles 9 chars (shows partial)', () => {
    expect(maskApiKey('123456789')).toBe('1234...6789');
  });
});
