import { describe, it, expect } from 'vitest';
import * as schema from '@database/schemas';

// ─── CMS Table exports ──────────────────────────────────────────────

const cmsTables = [
  'siteSettings',
  'socialLinks',
  'contactInfo',
  'openingHours',
  'themeSettings',
  'navigationMenus',
  'navigationItems',
] as const;

describe('CMS Schema — Table exports', () => {
  it.each(cmsTables)('exports %s table', (tableName) => {
    const table = (schema as Record<string, unknown>)[tableName];
    expect(table).toBeDefined();
  });
});

// ─── siteSettings columns ───────────────────────────────────────────

describe('siteSettings table columns', () => {
  const cols = schema.siteSettings as unknown as Record<string, unknown>;

  it.each([
    'id', 'locale', 'siteName', 'siteDescription', 'siteSlogan',
    'metaTitle', 'metaDescription', 'logoLight', 'logoDark',
    'favicon', 'ogImage', 'createdAt', 'updatedAt',
  ])('has %s column', (col) => {
    expect(cols[col]).toBeDefined();
  });
});

// ─── openingHours columns (including midday break) ──────────────────

describe('openingHours table columns', () => {
  const cols = schema.openingHours as unknown as Record<string, unknown>;

  it.each([
    'id', 'dayOfWeek', 'openTime', 'closeTime', 'isClosed',
    'hasMiddayBreak', 'morningOpen', 'morningClose',
    'afternoonOpen', 'afternoonClose', 'createdAt', 'updatedAt',
  ])('has %s column', (col) => {
    expect(cols[col]).toBeDefined();
  });
});

// ─── themeSettings columns ──────────────────────────────────────────

describe('themeSettings table columns', () => {
  const cols = schema.themeSettings as unknown as Record<string, unknown>;

  it.each([
    'id', 'name', 'isActive', 'primaryColor', 'secondaryColor',
    'accentColor', 'backgroundColor', 'foregroundColor',
    'mutedColor', 'mutedForegroundColor', 'fontHeading', 'fontBody',
    'borderRadius', 'createdAt', 'updatedAt',
  ])('has %s column', (col) => {
    expect(cols[col]).toBeDefined();
  });
});

// ─── contactInfo columns ────────────────────────────────────────────

describe('contactInfo table columns', () => {
  const cols = schema.contactInfo as unknown as Record<string, unknown>;

  it.each([
    'id', 'email', 'phone', 'address', 'city', 'postalCode',
    'country', 'mapUrl', 'latitude', 'longitude', 'createdAt', 'updatedAt',
  ])('has %s column', (col) => {
    expect(cols[col]).toBeDefined();
  });
});

// ─── navigationMenus columns ────────────────────────────────────────

describe('navigationMenus table columns', () => {
  const cols = schema.navigationMenus as unknown as Record<string, unknown>;

  it.each([
    'id', 'name', 'description', 'createdAt', 'updatedAt',
  ])('has %s column', (col) => {
    expect(cols[col]).toBeDefined();
  });
});

// ─── navigationItems columns ────────────────────────────────────────

describe('navigationItems table columns', () => {
  const cols = schema.navigationItems as unknown as Record<string, unknown>;

  it.each([
    'id', 'menuId', 'parentId', 'locale', 'label', 'url',
    'icon', 'sortOrder', 'isActive', 'openInNewTab', 'createdAt', 'updatedAt',
  ])('has %s column', (col) => {
    expect(cols[col]).toBeDefined();
  });
});

// ─── socialLinks columns ────────────────────────────────────────────

describe('socialLinks table columns', () => {
  const cols = schema.socialLinks as unknown as Record<string, unknown>;

  it.each([
    'id', 'platform', 'url', 'icon', 'label',
    'sortOrder', 'isActive', 'createdAt', 'updatedAt',
  ])('has %s column', (col) => {
    expect(cols[col]).toBeDefined();
  });
});
