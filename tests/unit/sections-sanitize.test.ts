import { describe, it, expect, vi } from 'vitest';

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

import { sanitizeSectionContent } from '@/actions/admin/sections';

describe('sanitizeSectionContent', () => {
  it('sanitizes string values in a flat object', () => {
    const input = JSON.stringify({ title: '<script>alert(1)</script>Hello' });
    const result = sanitizeSectionContent(input) as Record<string, unknown>;
    expect(result.title).toBe('Hello');
    expect(result.title).not.toContain('<script>');
  });

  it('preserves non-string values unchanged', () => {
    const input = JSON.stringify({ count: 42, active: true, empty: null });
    const result = sanitizeSectionContent(input) as Record<string, unknown>;
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.empty).toBeNull();
  });

  it('sanitizes nested object values recursively', () => {
    const input = JSON.stringify({
      hero: { title: '<img src=x onerror=alert(1)>Safe', subtitle: 'ok' },
    });
    const result = sanitizeSectionContent(input) as Record<string, any>;
    expect(result.hero.title).not.toContain('onerror');
    expect(result.hero.subtitle).toBe('ok');
  });

  it('sanitizes array elements recursively', () => {
    const input = JSON.stringify({
      items: ['<b>bold</b>', '<script>xss</script>clean'],
    });
    const result = sanitizeSectionContent(input) as Record<string, any>;
    expect(result.items[0]).toBe('<b>bold</b>');
    expect(result.items[1]).toBe('clean');
  });

  it('sanitizes deeply nested structures', () => {
    const input = JSON.stringify({
      level1: {
        level2: [{ html: '<div onclick="hack()">text</div>' }],
      },
    });
    const result = sanitizeSectionContent(input) as Record<string, any>;
    expect(result.level1.level2[0].html).toBe('<div>text</div>');
    expect(result.level1.level2[0].html).not.toContain('onclick');
  });

  it('throws on invalid JSON', () => {
    expect(() => sanitizeSectionContent('not json')).toThrow();
    expect(() => sanitizeSectionContent('{broken')).toThrow();
  });

  it('handles empty object', () => {
    const result = sanitizeSectionContent('{}');
    expect(result).toEqual({});
  });

  it('handles empty array', () => {
    const result = sanitizeSectionContent('[]');
    expect(result).toEqual([]);
  });

  it('preserves allowed HTML tags', () => {
    const input = JSON.stringify({
      html: '<p>paragraph</p><strong>bold</strong><a href="/link">link</a>',
    });
    const result = sanitizeSectionContent(input) as Record<string, unknown>;
    expect(result.html).toContain('<p>');
    expect(result.html).toContain('<strong>');
    expect(result.html).toContain('<a');
  });

  it('strips data-* attributes (ALLOW_DATA_ATTR: false)', () => {
    const input = JSON.stringify({
      html: '<div data-custom="value">text</div>',
    });
    const result = sanitizeSectionContent(input) as Record<string, unknown>;
    expect(result.html).not.toContain('data-custom');
    expect(result.html).toContain('text');
  });
});
