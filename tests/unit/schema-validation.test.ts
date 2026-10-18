import { describe, it, expect } from 'vitest';
import * as schema from '@database/schemas';

const expectedTables = [
  'user',
  'session',
  'account',
  'verification',
  'organization',
  'member',
  'invitation',
  'auditLog',
] as const;

describe('Schema — Table exports', () => {
  it.each(expectedTables)('exports %s table', (tableName) => {
    const table = (schema as Record<string, unknown>)[tableName];
    expect(table).toBeDefined();
  });

  it('user table has critical columns', () => {
    const cols = schema.user as unknown as Record<string, unknown>;
    expect(cols.id).toBeDefined();
    expect(cols.email).toBeDefined();
    expect(cols.name).toBeDefined();
    expect(cols.emailVerified).toBeDefined();
    expect(cols.role).toBeDefined();
    expect(cols.banned).toBeDefined();
  });

  it('session table has userId and token', () => {
    const cols = schema.session as unknown as Record<string, unknown>;
    expect(cols.id).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.token).toBeDefined();
    expect(cols.expiresAt).toBeDefined();
  });

  it('auditLog table has action and resource', () => {
    const cols = schema.auditLog as unknown as Record<string, unknown>;
    expect(cols.id).toBeDefined();
    expect(cols.action).toBeDefined();
    expect(cols.resource).toBeDefined();
    expect(cols.userId).toBeDefined();
  });

  it('organization table has name and slug', () => {
    const cols = schema.organization as unknown as Record<string, unknown>;
    expect(cols.id).toBeDefined();
    expect(cols.name).toBeDefined();
    expect(cols.slug).toBeDefined();
  });
});
