import { describe, it, expect } from 'vitest';
import { z } from 'astro/zod';

/**
 * Tests for the content import schema validation.
 * Validates the import JSON structure without hitting the database.
 */

const sectionSchema = z.object({
  type: z.string().min(1).max(50),
  content: z.unknown(),
  sortOrder: z.number().int().min(0).max(10000),
  isVisible: z.boolean(),
});

const pageSchema = z.object({
  locale: z.string().min(2).max(10),
  slug: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  metaTitle: z.string().max(70).nullable().optional(),
  metaDescription: z.string().max(160).nullable().optional(),
  ogImage: z.string().max(500).nullable().optional(),
  canonical: z.string().max(500).nullable().optional(),
  robots: z.string().max(200).nullable().optional(),
  template: z.string().max(50).optional().default('default'),
  isPublished: z.boolean().optional().default(false),
  publishedAt: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional().default(0),
  sections: z.array(sectionSchema).max(200).optional().default([]),
});

const importSchema = z.object({
  version: z.number().int().min(1).max(1),
  pages: z.array(pageSchema).min(1).max(1000),
});

describe('Content Import Schema', () => {
  it('accepts valid import data', () => {
    const valid = {
      version: 1,
      pages: [
        {
          locale: 'fr',
          slug: 'about',
          title: 'À propos',
          sections: [
            { type: 'text', content: { html: '<p>Hello</p>' }, sortOrder: 0, isVisible: true },
          ],
        },
      ],
    };
    const result = importSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects empty pages array', () => {
    const invalid = { version: 1, pages: [] };
    const result = importSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects missing version', () => {
    const invalid = { pages: [{ locale: 'fr', slug: 'x', title: 'X' }] };
    const result = importSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects version other than 1', () => {
    const invalid = { version: 2, pages: [{ locale: 'fr', slug: 'x', title: 'X' }] };
    const result = importSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects page with empty slug', () => {
    const invalid = {
      version: 1,
      pages: [{ locale: 'fr', slug: '', title: 'X' }],
    };
    const result = importSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects page with empty title', () => {
    const invalid = {
      version: 1,
      pages: [{ locale: 'fr', slug: 'x', title: '' }],
    };
    const result = importSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('defaults sections to empty array when omitted', () => {
    const valid = {
      version: 1,
      pages: [{ locale: 'fr', slug: 'x', title: 'X' }],
    };
    const result = importSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pages[0].sections).toEqual([]);
    }
  });

  it('sets default template and sortOrder', () => {
    const valid = {
      version: 1,
      pages: [{ locale: 'en', slug: 'test', title: 'Test' }],
    };
    const result = importSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pages[0].template).toBe('default');
      expect(result.data.pages[0].sortOrder).toBe(0);
    }
  });

  it('accepts page with all optional fields', () => {
    const valid = {
      version: 1,
      pages: [
        {
          locale: 'fr',
          slug: 'full-page',
          title: 'Full Page',
          metaTitle: 'Meta Title',
          metaDescription: 'Meta description here',
          ogImage: '/uploads/image.jpg',
          canonical: 'https://example.com/full-page',
          robots: 'noindex',
          template: 'landing',
          isPublished: true,
          publishedAt: '2024-01-01T00:00:00.000Z',
          sortOrder: 10,
          sections: [
            { type: 'hero', content: { title: 'Welcome' }, sortOrder: 0, isVisible: true },
            { type: 'text', content: { html: '<p>Content</p>' }, sortOrder: 1, isVisible: false },
          ],
        },
      ],
    };
    const result = importSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects section with negative sortOrder', () => {
    const invalid = {
      version: 1,
      pages: [
        {
          locale: 'fr',
          slug: 'x',
          title: 'X',
          sections: [{ type: 'text', content: {}, sortOrder: -1, isVisible: true }],
        },
      ],
    };
    const result = importSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
