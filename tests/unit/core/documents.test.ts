/** core/documents — échappement, CSS imprimable sans ressource distante, coque HTML (CSP, RTL), port PdfRenderer. */
import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  DocumentRenderError,
  PdfRenderer,
  PdfRendererUnavailable,
  escapeHtml,
  makeMemoryPdfRenderer,
  printDocument,
  PRINT_CSP,
  sanitizePrintCss,
} from '@/core/documents';

describe('escapeHtml', () => {
  it('échappe les caractères HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
  it('accepte null / nombres', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('sanitizePrintCss', () => {
  it('retire @import et url() distantes, garde data:', () => {
    const css = `@import url("https://evil.test/a.css"); .a{background:url(https://evil.test/x.png)} .b{background:url('data:image/png;base64,AA')}`;
    const out = sanitizePrintCss(css);
    expect(out).not.toContain('@import');
    expect(out).not.toContain('evil.test');
    expect(out).toContain("url('data:image/png;base64,AA')");
  });
});

describe('printDocument', () => {
  it('pose lang/dir ltr, la CSP et le titre échappé', () => {
    const html = printDocument({ locale: 'fr', title: 'A <b>', body: '<p>x</p>' });
    expect(html).toContain('<html lang="fr" dir="ltr">');
    expect(html).toContain(`content="${PRINT_CSP}"`);
    expect(html).toContain('<title>A &lt;b&gt;</title>');
    expect(html).toContain('<body><p>x</p></body>');
    expect(html).not.toMatch(/<script|<link/i);
  });
  it('passe en RTL pour l’arabe', () => {
    expect(printDocument({ locale: 'ar', title: 't', body: '' })).toContain('<html lang="ar" dir="rtl">');
  });
  it('assainit le CSS du thème', () => {
    const html = printDocument({ locale: 'en', title: 't', body: '', css: ':root{--primary:#f00} .x{background:url(http://a.test/i.png)}' });
    expect(html).toContain('--primary:#f00');
    expect(html).not.toContain('a.test');
  });
});

describe('PdfRenderer', () => {
  it('PdfRendererUnavailable échoue avec reason "unavailable"', () => {
    const exit = Effect.runSyncExit(
      Effect.gen(function* () {
        const renderer = yield* PdfRenderer;
        return yield* renderer.render('<p>x</p>');
      }).pipe(Effect.provide(PdfRendererUnavailable)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain('unavailable');
  });
  it('le moteur mémoire enregistre le HTML et renvoie un PDF', () => {
    const memory = makeMemoryPdfRenderer();
    const bytes = Effect.runSync(memory.render('<p>x</p>'));
    expect(new TextDecoder().decode(bytes).startsWith('%PDF-')).toBe(true);
    expect(memory.rendered).toEqual(['<p>x</p>']);
  });
  it('DocumentRenderError est taguée', () => {
    expect(new DocumentRenderError({ reason: 'timeout' })._tag).toBe('DocumentRenderError');
  });
});
