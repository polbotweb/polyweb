import { describe, it, expect } from 'vitest';
import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { introspectTable } from '@/core/crud/introspect';
import { evaluateAccess, buildInputSchema } from '@/core/crud/engine';
import { parseAccessRule, assertCrudResourceDefinition } from '@/core/crud/contract';

const widgets = pgTable('widgets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['a', 'b'] }).notNull(),
  weight: integer('weight'),
  active: boolean('active').default(true).notNull(),
  apiToken: text('api_token'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
const users = pgTable('user', { id: text('id').primaryKey() });

describe('CRUD introspection', () => {
  const def = introspectTable(widgets, 'widgets');
  it('maps columns, hides sensitive ones and locks auto columns', () => {
    expect(def.id).toBe('widgets');
    expect(def.columns.map((c) => c.key)).toEqual(['id', 'name', 'kind', 'weight', 'active', 'createdAt']);
    expect(def.columns.find((c) => c.key === 'createdAt')?.writable).toBe(false);
    expect(def.columns.find((c) => c.key === 'kind')?.enumValues).toEqual(['a', 'b']);
  });
  it('defaults to admin-only reads and disabled writes', () => {
    expect(def.access).toEqual({ list: 'role:admin', read: 'role:admin', create: 'disabled', update: 'disabled', delete: 'disabled' });
  });
  it('refuses protected tables', () => {
    expect(() => introspectTable(users, 'user')).toThrow(/protégée/);
  });
  it('rejects writable sensitive columns in hand-written definitions', () => {
    expect(() => assertCrudResourceDefinition({ ...def, columns: [...def.columns, { key: 'secretKey', name: 'secret_key', type: 'string', notNull: false, hasDefault: false, isPrimary: false, writable: true }] })).toThrow(/sensible/);
  });
});

describe('CRUD validation', () => {
  const def = introspectTable(widgets, 'widgets');
  it('requires non-null columns without default on create and rejects unknown keys', () => {
    const schema = buildInputSchema(def, 'create');
    expect(schema.safeParse({ name: 'x', kind: 'a' }).success).toBe(true);
    expect(schema.safeParse({ name: 'x' }).success).toBe(false);
    expect(schema.safeParse({ name: 'x', kind: 'c' }).success).toBe(false);
    expect(schema.safeParse({ name: 'x', kind: 'a', id: 'forced' }).success).toBe(false);
  });
  it('requires at least one field on update', () => {
    const schema = buildInputSchema(def, 'update');
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ weight: null }).success).toBe(true);
  });
});

describe('CRUD access rules', () => {
  it('evaluates public/auth/role/permission/disabled', async () => {
    const admin = { id: '1', role: 'admin' };
    const editor = { id: '2', role: 'editor' };
    expect(await evaluateAccess('public', null)).toBe(true);
    expect(await evaluateAccess('auth', null)).toBe(false);
    expect(await evaluateAccess('auth', { id: '3', banned: true })).toBe(false);
    expect(await evaluateAccess('role:admin|editor', editor)).toBe(true);
    expect(await evaluateAccess('role:admin', editor)).toBe(false);
    expect(await evaluateAccess('permission:site:update', admin, async (r, a) => r === 'site' && a === 'update')).toBe(true);
    expect(await evaluateAccess('disabled', admin)).toBe(false);
  });
  it('parses rules strictly', () => {
    expect(() => parseAccessRule('everyone')).toThrow();
    expect(parseAccessRule('role:admin|editor')).toBe('role:admin|editor');
  });
});
