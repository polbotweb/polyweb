/**
 * Theme token definitions matching global.css CSS variables.
 * Used by the admin theme editor, the DB schema validation, and CSS injection.
 */

/** All CSS variable names used in the design system (without -- prefix). */
export const THEME_TOKEN_KEYS = [
  'background', 'foreground',
  'card', 'card-foreground',
  'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'primary-accent', 'primary-deep',
  'secondary', 'secondary-foreground', 'secondary-accent',
  'muted', 'muted-foreground',
  'accent', 'accent-foreground',
  'info', 'info-foreground',
  'success', 'success-foreground',
  'warning', 'warning-foreground',
  'error', 'error-foreground',
  'gradient-warm', 'gradient-cool',
  'border', 'input', 'outline',
  'sidebar-background', 'sidebar-foreground',
  'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground',
  'sidebar-border', 'sidebar-outline',
] as const;

export type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number];
export type ThemeTokenMap = Partial<Record<ThemeTokenKey, string>>;

/** Groups for the admin UI editor. */
export const THEME_TOKEN_GROUPS = [
  { key: 'surfaces', label: 'Surfaces', tokens: ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground'] },
  { key: 'primary', label: 'Primary', tokens: ['primary', 'primary-foreground', 'primary-accent', 'primary-deep'] },
  { key: 'secondary', label: 'Secondary', tokens: ['secondary', 'secondary-foreground', 'secondary-accent'] },
  { key: 'muted', label: 'Muted', tokens: ['muted', 'muted-foreground'] },
  { key: 'accent', label: 'Accent', tokens: ['accent', 'accent-foreground'] },
  { key: 'status', label: 'Status', tokens: ['info', 'info-foreground', 'success', 'success-foreground', 'warning', 'warning-foreground', 'error', 'error-foreground'] },
  { key: 'gradients', label: 'Gradients', tokens: ['gradient-warm', 'gradient-cool'] },
  { key: 'structural', label: 'Structural', tokens: ['border', 'input', 'outline'] },
  { key: 'sidebar', label: 'Sidebar', tokens: ['sidebar-background', 'sidebar-foreground', 'sidebar-primary', 'sidebar-primary-foreground', 'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border', 'sidebar-outline'] },
] as const satisfies ReadonlyArray<{ key: string; label: string; tokens: readonly ThemeTokenKey[] }>;

/** Default light mode tokens (Fire Brand theme from global.css). */
export const DEFAULT_LIGHT_TOKENS: ThemeTokenMap = {
  'background':              'oklch(1 0 0)',
  'foreground':              'oklch(0.148 0.018 75)',
  'card':                    'oklch(0.985 0.008 80)',
  'card-foreground':         'oklch(0.148 0.018 75)',
  'popover':                 'oklch(0.985 0.008 80)',
  'popover-foreground':      'oklch(0.148 0.018 75)',
  'primary':                 'oklch(0.880 0.200 68)',
  'primary-foreground':      'oklch(0.148 0.018 75)',
  'primary-accent':          'oklch(0.820 0.205 68)',
  'primary-deep':            'oklch(0.500 0.120 68)',
  'secondary':               'oklch(0.922 0.012 75)',
  'secondary-foreground':    'oklch(0.148 0.018 75)',
  'secondary-accent':        'oklch(0.148 0.018 75)',
  'muted':                   'oklch(0.962 0.008 78)',
  'muted-foreground':        'oklch(0.400 0.016 75)',
  'accent':                  'oklch(0.962 0.008 78)',
  'accent-foreground':       'oklch(0.148 0.018 75)',
  'info':                    'oklch(0.828 0.111 211.664)',
  'info-foreground':         'oklch(0.164 0.056 232.539)',
  'success':                 'oklch(0.871 0.150 151.336)',
  'success-foreground':      'oklch(0.157 0.052 156.743)',
  'warning':                 'oklch(0.870 0.200 38)',
  'warning-foreground':      'oklch(0.148 0.018 75)',
  'error':                   'oklch(0.444 0.177 26.899)',
  'error-foreground':        'oklch(0.985 0.002 75)',
  'gradient-warm':           'oklch(0.640 0.220 50)',
  'gradient-cool':           'oklch(0.480 0.220 240)',
  'border':                  'oklch(0.882 0.016 75)',
  'input':                   'oklch(0.882 0.016 75)',
  'outline':                 'oklch(0.652 0.020 75)',
  'sidebar-background':      'oklch(0.962 0.008 78)',
  'sidebar-foreground':      'oklch(0.148 0.018 75)',
  'sidebar-primary':         'oklch(0.880 0.200 68)',
  'sidebar-primary-foreground': 'oklch(0.148 0.018 75)',
  'sidebar-accent':          'oklch(0.922 0.012 75)',
  'sidebar-accent-foreground':'oklch(0.148 0.018 75)',
  'sidebar-border':          'oklch(0.882 0.016 75)',
  'sidebar-outline':         'oklch(0.652 0.020 75)',
};

/** Default dark mode tokens. */
export const DEFAULT_DARK_TOKENS: ThemeTokenMap = {
  'background':              'oklch(0.148 0.018 75)',
  'foreground':              'oklch(0.975 0.008 80)',
  'card':                    'oklch(0.220 0.015 75)',
  'card-foreground':         'oklch(0.975 0.008 80)',
  'popover':                 'oklch(0.310 0.014 75)',
  'popover-foreground':      'oklch(0.975 0.008 80)',
  'primary':                 'oklch(0.880 0.200 68)',
  'primary-foreground':      'oklch(0.148 0.018 75)',
  'primary-accent':          'oklch(0.820 0.205 68)',
  'primary-deep':            'oklch(0.880 0.200 68)',
  'secondary':               'oklch(0.310 0.014 75)',
  'secondary-foreground':    'oklch(0.975 0.008 80)',
  'secondary-accent':        'oklch(0.975 0.008 80)',
  'muted':                   'oklch(0.310 0.014 75)',
  'muted-foreground':        'oklch(0.745 0.016 75)',
  'accent':                  'oklch(0.410 0.018 75)',
  'accent-foreground':       'oklch(0.920 0.010 75)',
  'info':                    'oklch(0.828 0.111 211.664)',
  'info-foreground':         'oklch(0.164 0.056 232.539)',
  'success':                 'oklch(0.871 0.150 151.336)',
  'success-foreground':      'oklch(0.157 0.052 156.743)',
  'warning':                 'oklch(0.870 0.200 38)',
  'warning-foreground':      'oklch(0.148 0.018 75)',
  'error':                   'oklch(0.505 0.213 27.325)',
  'error-foreground':        'oklch(0.975 0.008 80)',
  'gradient-warm':           'oklch(0.740 0.210 50)',
  'gradient-cool':           'oklch(0.590 0.215 240)',
  'border':                  'oklch(1 0 0 / 12%)',
  'input':                   'oklch(1 0 0 / 18%)',
  'outline':                 'oklch(0.620 0.020 75)',
  'sidebar-background':      'oklch(0.220 0.015 75)',
  'sidebar-foreground':      'oklch(0.975 0.008 80)',
  'sidebar-primary':         'oklch(0.880 0.200 68)',
  'sidebar-primary-foreground': 'oklch(0.148 0.018 75)',
  'sidebar-accent':          'oklch(0.310 0.014 75)',
  'sidebar-accent-foreground':'oklch(0.920 0.010 75)',
  'sidebar-border':          'oklch(0.310 0.014 75)',
  'sidebar-outline':         'oklch(0.527 0.020 75)',
};

/** Curated font families for the admin theme editor. */
export const FONT_OPTIONS = [
  { value: 'system-ui, sans-serif', label: 'System (default)' },
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet MS' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: '"Courier New", monospace', label: 'Courier New' },
  { value: '"Segoe UI", sans-serif', label: 'Segoe UI' },
  { value: 'Roboto, sans-serif', label: 'Roboto' },
  { value: '"Open Sans", sans-serif', label: 'Open Sans' },
  { value: 'Montserrat, sans-serif', label: 'Montserrat' },
  { value: 'Poppins, sans-serif', label: 'Poppins' },
  { value: 'Lato, sans-serif', label: 'Lato' },
  { value: '"Playfair Display", serif', label: 'Playfair Display' },
  { value: 'Merriweather, serif', label: 'Merriweather' },
  { value: '"DM Sans", sans-serif', label: 'DM Sans' },
  { value: 'Raleway, sans-serif', label: 'Raleway' },
  { value: 'Nunito, sans-serif', label: 'Nunito' },
] as const;

/** Border-radius presets for the admin theme editor. */
export const RADIUS_PRESETS = [
  { value: '0',        label: 'None' },
  { value: '0.25rem',  label: 'Subtle' },
  { value: '0.375rem', label: 'Small' },
  { value: '0.5rem',   label: 'Medium' },
  { value: '0.625rem', label: 'Default' },
  { value: '0.75rem',  label: 'Large' },
  { value: '1rem',     label: 'XL' },
  { value: '1.5rem',   label: '2XL' },
  { value: '9999px',   label: 'Full' },
] as const;

/** OKLCH validation regex — supports optional alpha channel. */
const OKLCH_RE = /^oklch\(\s*[\d.]+%?\s+[\d.]+\s+[\d.]+(?:\s*\/\s*[\d.]+%?)?\s*\)$/;

/** Validate a single OKLCH value. */
export function isValidOklch(value: string): boolean {
  return OKLCH_RE.test(value);
}

/** Parse and validate a token map JSON string. Returns null on invalid input. */
export function parseTokenMap(json: string | null): ThemeTokenMap | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const result: ThemeTokenMap = {};
    const validKeys = new Set<string>(THEME_TOKEN_KEYS);
    for (const [key, value] of Object.entries(parsed)) {
      if (!validKeys.has(key)) continue;
      if (typeof value !== 'string' || !isValidOklch(value)) continue;
      result[key as ThemeTokenKey] = value;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Generate a CSS string from token overrides for injection into <style>.
 * Only includes tokens that differ from defaults. Produces both :root and .dark blocks.
 */
export function generateThemeCss(
  lightTokens: ThemeTokenMap,
  darkTokens: ThemeTokenMap,
  radius?: string | null,
): string {
  const lines: string[] = [];

  const lightVars = Object.entries(lightTokens)
    .filter(([, v]) => v)
    .map(([k, v]) => `  --${k}: ${v};`);
  if (radius) lightVars.push(`  --radius: ${radius};`);

  if (lightVars.length > 0) {
    lines.push('html:root {', ...lightVars, '}');
  }

  const darkVars = Object.entries(darkTokens)
    .filter(([, v]) => v)
    .map(([k, v]) => `  --${k}: ${v};`);

  if (darkVars.length > 0) {
    lines.push('html.dark {', ...darkVars, '}');
  }

  return lines.join('\n');
}
