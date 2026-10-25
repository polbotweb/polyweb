import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { allowInlineStyle, cspSha256 } from '@/lib/security/csp-hash';

describe('csp-hash', () => {
  it('produit une empreinte sha256 base64 du contenu exact', () => {
    const css = ':root{--primary:#123456}';
    expect(cspSha256(css)).toBe(`sha256-${createHash('sha256').update(css).digest('base64')}`);
    expect(cspSha256(css)).not.toBe(cspSha256(`${css} `));
  });

  it('déclare le hash du style inline, ignore un contenu vide ou une CSP absente', () => {
    const insertStyleHash = vi.fn();
    allowInlineStyle({ insertStyleHash }, 'a{}');
    expect(insertStyleHash).toHaveBeenCalledWith(cspSha256('a{}'));
    allowInlineStyle({ insertStyleHash }, '');
    expect(insertStyleHash).toHaveBeenCalledTimes(1);
    expect(() => allowInlineStyle(undefined, 'a{}')).not.toThrow();
  });
});
