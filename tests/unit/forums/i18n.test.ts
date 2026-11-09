import { describe, it, expect } from 'vitest';
import { getForumsTranslations } from '@/modules/forums/i18n';

const flatten = (o: unknown, prefix = ''): Record<string, unknown> =>
  typeof o === 'object' && o !== null ? Object.assign({}, ...Object.entries(o).map(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k))) : { [prefix]: o };

describe('forums — libellés', () => {
  it('mêmes clés non vides dans les 4 langues, repli fr', () => {
    const fr = flatten(getForumsTranslations('fr'));
    for (const locale of ['en', 'es', 'ar']) {
      const other = flatten(getForumsTranslations(locale));
      expect(Object.keys(other).sort(), locale).toEqual(Object.keys(fr).sort());
      for (const [k, v] of Object.entries(other)) expect(typeof v === 'string' && v.trim().length > 0, `${locale}.${k}`).toBe(true);
    }
    expect(getForumsTranslations('de').title).toBe('Forums');
  });
});
