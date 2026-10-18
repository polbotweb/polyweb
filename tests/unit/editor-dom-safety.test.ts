import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const contentEditorSource = readFileSync(
  resolve(process.cwd(), 'src/components/content/ContentEditor.astro'),
  'utf8',
);
const adminPostFormSource = readFileSync(
  resolve(process.cwd(), 'src/components/blog/AdminPostForm.astro'),
  'utf8',
);

describe('editor DOM safety guards', () => {
  it('wires heading and list toolbar commands to HTML formatters', () => {
    expect(contentEditorSource).toContain('formatHeadingSelection(val, s, e)');
    expect(contentEditorSource).toContain('formatUnorderedListSelection(val, s, e)');
    expect(contentEditorSource).not.toContain("prefixLines(val, s, e, '## ')");
    expect(contentEditorSource).not.toContain("prefixLines(val, s, e, '- ')");
  });

  it('renders internal-link search statuses and API labels as text nodes', () => {
    expect(contentEditorSource).not.toMatch(/resultsEl\.innerHTML/);
    expect(contentEditorSource).toContain('resultsEl.replaceChildren');
    expect(contentEditorSource).toContain('status.textContent = message');
    expect(contentEditorSource).toContain('item.textContent = r.label');
  });

  it('renders the admin dead-link report without innerHTML assembly', () => {
    expect(adminPostFormSource).not.toMatch(/reportEl\.innerHTML/);
    expect(adminPostFormSource).toContain('reportEl.replaceChildren');
    expect(adminPostFormSource).toContain('item.textContent = text');
  });

  it('guards dirty forms and marks successful saves clean', () => {
    expect(adminPostFormSource).toContain("window.addEventListener('beforeunload'");
    expect(adminPostFormSource).toContain('if (!isDirty) return');
    expect(adminPostFormSource).toMatch(
      /if \(result\.error\)[\s\S]+?return;[\s\S]+?isDirty = false;[\s\S]+?toast\.success/,
    );
  });
});
