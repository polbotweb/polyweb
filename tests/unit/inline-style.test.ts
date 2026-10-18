import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hiddenUntilScript, parseDeclarations, styleAttr, styleText, toDeclarations } from '@/lib/ui/inline-style';

describe('inline-style (CSP stricte)', () => {
  it('sérialise en kebab-case et ignore les valeurs vides', () => {
    expect(toDeclarations({ animationDuration: '150ms', '--i': 2, width: '', left: null, top: undefined, x: false }))
      .toBe('animation-duration:150ms;--i:2');
  });

  it('rejette les valeurs capables de sortir de la déclaration', () => {
    expect(toDeclarations({ color: 'red;background:url(x)', top: '1px}', left: '/* x */', width: '</style>', '--a': 'a\\b' })).toBe('');
    expect(toDeclarations({ 'bad property': '1', '1x': '1', 'a:b': '1' })).toBe('');
  });

  it('styleAttr ne produit jamais d’attribut style', () => {
    expect(styleAttr({ '--x': '1px' })).toEqual({ 'data-style': '--x:1px' });
    expect(styleAttr({})).toEqual({});
    expect(Object.keys(styleAttr({ color: 'red' }))).not.toContain('style');
  });

  it('parseDeclarations est l’inverse sûr de toDeclarations', () => {
    expect(parseDeclarations('width:4px;--d:1s;bad;x:;color:red}')).toEqual([['width', '4px'], ['--d', '1s']]);
    expect(parseDeclarations(toDeclarations({ fontFamily: "'Inter', sans-serif", background: 'oklch(0.5 0.1 200)' })))
      .toEqual([['font-family', "'Inter', sans-serif"], ['background', 'oklch(0.5 0.1 200)']]);
  });

  it('styleText accepte un texte CSS et applique les mêmes filtres', () => {
    expect(styleText('background: red; color: var(--x); top: 1px}')).toEqual({ 'data-style': 'background:red;color:var(--x)' });
    expect(styleText('')).toEqual({});
  });

  it('hiddenUntilScript masque côté HTML et en CSSOM', () => {
    expect(hiddenUntilScript({ animationDuration: '150ms' })).toEqual({
      hidden: true,
      'data-style-hidden': '',
      'data-style': 'display:none;animation-duration:150ms',
    });
  });
});

/** Garde de régression : aucun attribut `style=` dans le balisage des composants. */
describe('aucun attribut style= dans src/**/*.astro', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.astro')) files.push(p);
    }
  };
  walk(join(process.cwd(), 'src'));

  it('aucune occurrence hors commentaires', () => {
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const code = line.trim();
        if (/^(\/\/|\*|\/\*|\{\/\*)/.test(code)) return;
        if (/(^|[\s<])style=/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
