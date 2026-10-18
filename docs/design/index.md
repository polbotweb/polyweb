# Design System — Index

> **Projet** : Atomic  
> **Stack** : Astro 6 + Tailwind CSS 4 + Starwind UI + tailwind-variants  
> **Palette** : Fire Brand — OKLCH color space — hue 68° (golden yellow)  
> **Composants** : 47 atoms + 8 wow effects  
> **Thème** : Light / Dark + thèmes custom extensibles

---

## Table des matières

| Document | Contenu |
| :-- | :-- |
| [tokens.md](tokens.md) | Design tokens OKLCH — couleurs, rayons, surfaces, gradients, mode sombre |
| [components.md](components.md) | Catalogue complet des 47 composants — props, slots, variants |
| [variants.md](variants.md) | Système de variants Tailwind — `tv()`, compound variants, composition |
| [create-component.md](create-component.md) | Guide pas-à-pas pour créer un nouveau composant Starwind |
| [theming.md](theming.md) | Créer un thème custom (retro, luxury, zen…) — light + dark, accessible |
| [accessibility.md](accessibility.md) | Règles WCAG AAA, contrastes, ARIA, focus, RTL |
| [animations.md](animations.md) | Composants wow — ScrollReveal, particles, marquee, blur cards |
| [style.md](style.md) | Conventions CSS, nommage, architecture des fichiers |
| [../cms/admin.md](../cms/admin.md) | CMS Admin — architecture, schémas, actions, loaders, i18n, tests |

---

## Architecture du design system

```text
src/
├── styles/
│   └── global.css              ← Tokens OKLCH + @theme + @layer base
├── lib/starwind/
│   ├── positioning.ts          ← Système de positionnement flottant
│   └── config-schema.json      ← Schéma JSON de la config Starwind
├── components/
│   ├── atoms/                  ← 47 composants de base (Button, Card, Input…)
│   │   └── {name}/
│   │       ├── {Name}.astro    ← Composant principal + tv() variants
│   │       ├── {Sub}.astro     ← Sous-composants (CardHeader, AlertTitle…)
│   │       ├── index.ts        ← Re-exports
│   │       └── {Name}.md       ← Doc du composant (optionnel)
│   ├── molecules/              ← Composants composés (à venir)
│   ├── organisms/              ← Header, Footer, Testimonials
│   ├── pages/                  ← Composants de pages
│   └── wow/                    ← Effets visuels et animations
├── layouts/
│   └── BaseLayout.astro        ← Layout racine (i18n, auth, theme)
└── starwind.config.json        ← Registry des composants + versions
```

## Principes fondamentaux

### 1. OKLCH comme espace couleur

Toutes les couleurs sont définies en **OKLCH** (Lightness, Chroma, Hue) :

- Contrôle perceptuel de la luminosité (L uniforme)
- Teinte constante entre light et dark mode
- Conformité WCAG AAA (7:1) vérifiée sur chaque paire fg/bg

### 2. Tailwind-variants (`tv()`) comme moteur de variants

Chaque composant définit ses styles via `tv()` :

- **Type-safe** : TypeScript infère les props depuis les variants
- **Compound variants** : combinaisons de variants (ex: `isLink + variant = hover state`)
- **Composition** : les sous-composants héritent du contexte parent via `group-data-*`

### 3. Atomic Design

| Niveau | Contenu | Exemples |
| :-- | :-- | :-- |
| **Atoms** | Composants indivisibles | Button, Input, Badge, Label |
| **Molecules** | Combinaisons d'atoms | (à venir) |
| **Organisms** | Sections de page | Header, Footer, Testimonials |
| **Pages** | Compositions full-page | HomePage, ContactPage, AdminStatsPage |
| **Wow** | Effets visuels | ScrollReveal, Particles, Marquee |

### 4. CSS Variables comme contrat

Les composants ne codent jamais de couleurs en dur. Ils utilisent les semantic tokens :

```css
/* ✅ Correct */
bg-primary text-primary-foreground

/* ❌ Interdit */
bg-yellow-500 text-gray-900
```

Changer un thème = changer les valeurs CSS dans `:root` / `.dark`. Les composants s'adaptent automatiquement.
