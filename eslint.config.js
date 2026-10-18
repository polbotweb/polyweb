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
