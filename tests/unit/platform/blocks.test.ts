import { describe, it, expect } from 'vitest';
import { parseBlocksDocument, renderBlocksToHtml, blocksToText, BlockValidationError, registerBlock, unregisterBlock, toEmbedUrl } from '@/core/blocks';
import { tiptapToHtml, safeHref } from '@/core/blocks/tiptap-html';
import { z } from 'astro/zod';

const doc = (blocks: unknown[]) => ({ version: 1, blocks });

describe('TipTap JSON → HTML', () => {
  it('rend les nœuds autorisés et échappe le texte', () => {
    const html = tiptapToHtml({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Titre <script>' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'gras', marks: [{ type: 'bold' }] }, { type: 'text', text: ' lien', marks: [{ type: 'link', attrs: { href: 'https://a.test' } }] }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] }] },
    ] });
    expect(html).toContain('<h2>Titre &lt;script&gt;</h2>');
    expect(html).toContain('<strong>gras</strong>');
    expect(html).toContain('href="https://a.test" rel="noopener noreferrer nofollow"');
    expect(html).toContain('<ul><li><p>x</p></li></ul>');
  });
  it('neutralise javascript: et les nœuds inconnus', () => {
    const html = tiptapToHtml({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'clic', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
      { type: 'iframe', attrs: { src: 'https://evil' } },
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'h' }] },
    ] });
    expect(html).toBe('<p>clic</p><h2>h</h2>');
    expect(safeHref('//evil.test')).toBeNull();
    expect(safeHref('/fr/page')).toBe('/fr/page');
  });
});

describe('registre de blocs', () => {
  it('valide, normalise et rend un document', () => {
    const parsed = parseBlocksDocument(JSON.stringify(doc([
      { id: 'a', type: 'heading', data: { level: '3', text: 'Bonjour' } },
      { id: 'b', type: 'richText', data: { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Corps' }] }] } } },
      { id: 'c', type: 'image', data: { url: '/uploads/x.webp', alt: 'Alt "q"' } },
      { id: 'd', type: 'embed', data: { url: 'https://www.youtube.com/watch?v=abc123' } },
      { id: 'e', type: 'divider', data: {} },
    ])));
    expect(parsed.blocks[0]!.data).toEqual({ level: 3, text: 'Bonjour' });
    const html = renderBlocksToHtml(parsed);
    expect(html).toContain('<h3 class="pw-block pw-heading">Bonjour</h3>');
    expect(html).toContain('alt="Alt &quot;q&quot;"');
    expect(html).toContain('https://www.youtube-nocookie.com/embed/abc123');
    expect(blocksToText(parsed)).toContain('Corps');
  });
  it('rejette types inconnus, ids dupliqués, données invalides, embeds hors liste', () => {
    expect(() => parseBlocksDocument(doc([{ id: 'a', type: 'nope', data: {} }]))).toThrow(BlockValidationError);
    expect(() => parseBlocksDocument(doc([{ id: 'a', type: 'divider', data: {} }, { id: 'a', type: 'divider', data: {} }]))).toThrow(/dupliqué/);
    expect(() => parseBlocksDocument(doc([{ id: 'a', type: 'heading', data: { text: '' } }]))).toThrow(BlockValidationError);
    expect(() => parseBlocksDocument(doc([{ id: 'a', type: 'embed', data: { url: 'https://evil.test/v' } }]))).toThrow(/YouTube/);
    expect(() => parseBlocksDocument(doc([{ id: 'a', type: 'cta', data: { label: 'x', href: 'javascript:1' } }]))).toThrow();
    expect(toEmbedUrl('http://youtube.com/watch?v=x')).toBeNull();
  });
  it('accepte un document vide et les blocs de plugins', () => {
    expect(parseBlocksDocument('')).toEqual({ version: 1, blocks: [] });
    registerBlock({ type: 'testStat', label: 'Stat', schema: z.object({ n: z.number() }), render: (d) => `<b>${d.n}</b>` });
    expect(renderBlocksToHtml(parseBlocksDocument(doc([{ id: 'x', type: 'testStat', data: { n: 4 } }])))).toBe('<b>4</b>');
    unregisterBlock('testStat');
    expect(() => registerBlock({ type: 'Bad Type', label: '', schema: z.object({}), render: () => '' })).toThrow();
  });
});
