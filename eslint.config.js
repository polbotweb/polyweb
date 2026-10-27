import eslintPluginAstro from "eslint-plugin-astro";

export default [
  // ── Ignore build output ──────────────────────────────────────────────
  { ignores: ["dist/**", ".astro/**", "playwright-report/**"] },

  // ── All astro rules (strictest preset) ────────────────────────────────
  ...eslintPluginAstro.configs["all"],

  // ── A11Y strict (jsx-a11y/strict adapted for Astro) ──────────────────
  ...eslintPluginAstro.configs["jsx-a11y-strict"],

  // ── Global overrides ─────────────────────────────────────────────────
  {
    rules: {
      // Security — prevent XSS via set:html
      "astro/no-set-html-directive": "error",

      // Best practices
      "astro/no-set-text-directive": "error",
      "astro/no-unused-css-selector": "warn",

      // Style — semicolons required
      "astro/semi": ["error", "always"],

      // ── Relaxed for Starwind component pattern ────────────────────────
      // Components export tv() instances for type inference — intentional
      "astro/no-exports-from-components": "off",

      // tv() returns a string used in class={...} — class:list not needed
      "astro/prefer-class-list-directive": "off",

      // Attribute sort is too noisy on a component library
      "astro/sort-attributes": "off",

      // Astro <script> tags are bundled at build time, NOT traditional
      // inline scripts — this rule is a false positive in Astro projects
      "astro/no-unsafe-inline-scripts": "off",
    },
  },

  // ── CMS SectionRenderer — set:html used with DOMPurify-sanitized content ──
  {
    files: ["src/components/pages/cms/SectionRenderer.astro"],
    rules: {
      "astro/no-set-html-directive": "off",
    },
  },

  // ── ScrollRegion — keyboard-scrollable overflow containers (a11y) ──
  // WCAG 2.1.1 / axe `scrollable-region-focusable`: an overflowing box whose
  // content is not focusable (data tables, diffs) must itself be reachable by
  // keyboard to be scrolled with the arrow keys. The WAI pattern is a NAMED
  // landmark: role="region" + aria-label/aria-labelledby + tabindex="0".
  // Narrow on purpose:
  //  - scoped to this single file, so every scroll wrapper has to go through
  //    the shared component (a hand-rolled one elsewhere still fails lint);
  //  - no-noninteractive-tabindex stays an ERROR, only the `region` role is
  //    added to the allowed roles (tabpanel is the rule's own default);
  //  - prefer-tag-over-role is off here only: it would suggest <section>,
  //    which maps to role=region solely when named; the explicit role keeps
  //    the landmark semantics independent of how the name is provided.
  {
    files: ["src/components/molecules/ScrollRegion/ScrollRegion.astro"],
    rules: {
      "astro/jsx-a11y/no-noninteractive-tabindex": ["error", { roles: ["tabpanel", "region"], tags: [] }],
      "astro/jsx-a11y/prefer-tag-over-role": "off",
    },
  },

  // ── Starwind library components — relax a11y semantic tag preference ──
  // These components use ARIA roles (role="dialog", role="region", etc.)
  // by design — the library handles semantics internally.
  {
    files: ["src/components/atoms/**/*.astro", "src/components/wow/**/*.astro"],
    rules: {
      "astro/jsx-a11y/prefer-tag-over-role": "off",
      // tabindex on tabpanel, dropzone label, etc. is standard WAI-ARIA
      "astro/jsx-a11y/no-noninteractive-tabindex": "off",
      // tv() generates class names at runtime — ESLint can't trace them
      "astro/no-unused-css-selector": "off",
    },
  },
];
