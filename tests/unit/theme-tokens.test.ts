import { describe, it, expect } from 'vitest';
import {
  THEME_TOKEN_KEYS,
  THEME_TOKEN_GROUPS,
  DEFAULT_LIGHT_TOKENS,
  DEFAULT_DARK_TOKENS,
  FONT_OPTIONS,
  RADIUS_PRESETS,
  isValidOklch,
  parseTokenMap,
  generateThemeCss,
} from '@/lib/theme-tokens';

// ── isValidOklch ────────────────────────────────────────────────────

describe('isValidOklch', () => {
  it('accepts standard oklch values', () => {
    expect(isValidOklch('oklch(0.65 0.15 250)')).toBe(true);
  });

  it('accepts percentage lightness', () => {
    expect(isValidOklch('oklch(65% 0.15 250)')).toBe(true);
  });

  it('accepts value with alpha channel', () => {
    expect(isValidOklch('oklch(1 0 0 / 12%)')).toBe(true);
  });

  it('accepts value with decimal alpha', () => {
    expect(isValidOklch('oklch(0.5 0.1 180 / 0.5)')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidOklch('')).toBe(false);
  });

  it('rejects hex color', () => {
    expect(isValidOklch('#ff0000')).toBe(false);
  });

  it('rejects rgb notation', () => {
    expect(isValidOklch('rgb(255, 0, 0)')).toBe(false);
  });

  it('rejects missing parameters', () => {
    expect(isValidOklch('oklch(0.65 0.15)')).toBe(false);
  });

  it('rejects random string', () => {
    expect(isValidOklch('not a color')).toBe(false);
  });
});

// ── parseTokenMap ───────────────────────────────────────────────────

describe('parseTokenMap', () => {
  it('returns null for null input', () => {
    expect(parseTokenMap(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTokenMap('')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseTokenMap('not json {')).toBeNull();
  });

  it('returns null for JSON array', () => {
    expect(parseTokenMap('["foo"]')).toBeNull();
  });

  it('returns null for JSON primitive', () => {
    expect(parseTokenMap('"just a string"')).toBeNull();
  });

  it('parses valid token map', () => {
    const json = JSON.stringify({ primary: 'oklch(0.88 0.2 68)' });
    const result = parseTokenMap(json);
    expect(result).toEqual({ primary: 'oklch(0.88 0.2 68)' });
  });

  it('filters out unknown keys', () => {
    const json = JSON.stringify({
      primary: 'oklch(0.88 0.2 68)',
      'unknown-key': 'oklch(0.5 0.1 180)',
    });
    const result = parseTokenMap(json);
    expect(result).toEqual({ primary: 'oklch(0.88 0.2 68)' });
  });

  it('filters out invalid OKLCH values', () => {
    const json = JSON.stringify({
      primary: 'oklch(0.88 0.2 68)',
      secondary: '#ff0000',
    });
    const result = parseTokenMap(json);
    expect(result).toEqual({ primary: 'oklch(0.88 0.2 68)' });
  });

  it('filters non-string values', () => {
    const json = JSON.stringify({ primary: 123 });
    const result = parseTokenMap(json);
    expect(result).toEqual({});
  });

  it('returns empty map for all-invalid input', () => {
    const json = JSON.stringify({ foo: 'bar' });
    const result = parseTokenMap(json);
    expect(result).toEqual({});
  });

  it('handles multiple valid tokens', () => {
    const json = JSON.stringify({
      primary: 'oklch(0.88 0.2 68)',
      background: 'oklch(1 0 0)',
      foreground: 'oklch(0.148 0.018 75)',
    });
    const result = parseTokenMap(json);
    expect(result).toEqual({
      primary: 'oklch(0.88 0.2 68)',
      background: 'oklch(1 0 0)',
      foreground: 'oklch(0.148 0.018 75)',
    });
  });
});

// ── generateThemeCss ────────────────────────────────────────────────

describe('generateThemeCss', () => {
  it('generates :root block for light tokens', () => {
    const css = generateThemeCss({ primary: 'oklch(0.88 0.2 68)' }, {});
    expect(css).toContain('html:root {');
    expect(css).toContain('--primary: oklch(0.88 0.2 68);');
    expect(css).toContain('}');
  });

  it('generates .dark block for dark tokens', () => {
    const css = generateThemeCss({}, { primary: 'oklch(0.88 0.2 68)' });
    expect(css).toContain('html.dark {');
    expect(css).toContain('--primary: oklch(0.88 0.2 68);');
  });

  it('generates both blocks', () => {
    const css = generateThemeCss(
      { background: 'oklch(1 0 0)' },
      { background: 'oklch(0.148 0.018 75)' },
    );
    expect(css).toContain('html:root {');
    expect(css).toContain('html.dark {');
  });

  it('includes radius in :root block', () => {
    const css = generateThemeCss({ primary: 'oklch(0.88 0.2 68)' }, {}, '0.5rem');
    expect(css).toContain('--radius: 0.5rem;');
  });

  it('returns empty string for empty maps', () => {
    expect(generateThemeCss({}, {})).toBe('');
  });

  it('returns empty string when no radius and empty maps', () => {
    expect(generateThemeCss({}, {}, null)).toBe('');
  });

  it('omits falsy values from output', () => {
    const css = generateThemeCss({ primary: 'oklch(0.88 0.2 68)', background: '' }, {});
    expect(css).not.toContain('--background');
    expect(css).toContain('--primary');
  });

  it('generates radius-only :root block when no light tokens', () => {
    const css = generateThemeCss({}, {}, '1rem');
    expect(css).toContain('html:root {');
    expect(css).toContain('--radius: 1rem;');
  });
});

// ── Constants ───────────────────────────────────────────────────────

describe('theme token constants', () => {
  it('THEME_TOKEN_KEYS has 38 entries', () => {
    expect(THEME_TOKEN_KEYS.length).toBe(38);
  });

  it('THEME_TOKEN_GROUPS covers all tokens', () => {
    const groupTokens = THEME_TOKEN_GROUPS.flatMap((g) => [...g.tokens]);
    for (const key of THEME_TOKEN_KEYS) {
      expect(groupTokens).toContain(key);
    }
  });

  it('DEFAULT_LIGHT_TOKENS has valid OKLCH values', () => {
    for (const [key, value] of Object.entries(DEFAULT_LIGHT_TOKENS)) {
      expect(THEME_TOKEN_KEYS).toContain(key);
      expect(isValidOklch(value!)).toBe(true);
    }
  });

  it('DEFAULT_DARK_TOKENS has valid OKLCH values', () => {
    for (const [key, value] of Object.entries(DEFAULT_DARK_TOKENS)) {
      expect(THEME_TOKEN_KEYS).toContain(key);
      expect(isValidOklch(value!)).toBe(true);
    }
  });

  it('FONT_OPTIONS has non-empty entries', () => {
    expect(FONT_OPTIONS.length).toBeGreaterThan(0);
    for (const opt of FONT_OPTIONS) {
      expect(opt.value).toBeTruthy();
      expect(opt.label).toBeTruthy();
    }
  });

  it('RADIUS_PRESETS has non-empty entries', () => {
    expect(RADIUS_PRESETS.length).toBeGreaterThan(0);
    for (const preset of RADIUS_PRESETS) {
      expect(preset.label).toBeTruthy();
    }
  });
});
