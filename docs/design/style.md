# Design System — Conventions CSS & Style

> Retour à l'[index](index.md)

---

## Architecture des styles

```md
src/styles/
└── global.css          ← Point d'entrée unique
```

Le fichier `global.css` organise les styles en **4 sections** :

| Section | Rôle |
| :-- | :-- |
| Imports & plugins | Tailwind CSS, tw-animate-css, @tailwindcss/forms |
| `@theme` | Keyframes d'animation (accordion) |
| `@theme inline` | Mapping CSS variables → Tailwind utilities |
| `:root` / `.dark` | Tokens OKLCH light/dark |
| `@layer base` | Résets globaux |

---

## Imports

```css
@import "tailwindcss";         /* Tailwind CSS 4 */
@import "tw-animate-css";      /* Animations d'entrée/sortie */
@plugin "@tailwindcss/forms";  /* Reset formulaires natifs */
```

### Custom variant dark

```css
@custom-variant dark (&:where(.dark, .dark *));
```

Active le mode sombre quand la classe `.dark` est sur n'importe quel ancêtre (typiquement `<html>`).

---

## `@theme inline` — Le pont CSS ↔ Tailwind

Le bloc `@theme inline` mappe chaque CSS variable vers une Tailwind utility :

```css
@theme inline {
  /* Couleurs → bg-primary, text-primary, border-primary */
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-accent: var(--primary-accent);

  /* Radius → rounded-xs, rounded-sm, rounded-md, rounded-lg... */
  --radius-xs: calc(var(--radius) - 0.375rem);
  --radius-sm: calc(var(--radius) - 0.25rem);
  --radius-lg: var(--radius);

  /* Sidebar → bg-sidebar, text-sidebar-foreground... */
  --color-sidebar: var(--sidebar-background);
  --color-sidebar-foreground: var(--sidebar-foreground);
}
```

**Résultat** : écrire `bg-primary` en Tailwind résout `var(--primary)` qui vaut `oklch(0.880 0.200 68)`.

---

## `@layer base` — Résets globaux

```css
@layer base {
  * {
    @apply border-border outline-outline/50;
  }
  body {
    @apply bg-background text-foreground scheme-light dark:scheme-dark;
  }
  button {
    @apply cursor-pointer;
  }
}
```

| Règle | Effet |
| :-- | :-- |
| `border-border` sur `*` | Toute bordure utilise le token `--border` par défaut |
| `outline-outline/50` sur `*` | Tout outline utilise le token `--outline` à 50% |
| `bg-background text-foreground` sur body | Couleurs de base |
| `scheme-light dark:scheme-dark` | Color scheme natif pour scrollbars, etc. |
| `cursor-pointer` sur button | Pointeur sur tous les boutons |

---

## Animations Starwind

Le design system utilise `tw-animate-css` pour les animations d'entrée/sortie :

```css
/* Classes utilisées dans les composants */
data-[state=open]:animate-in        /* Animation d'entrée */
data-[state=closed]:animate-out     /* Animation de sortie */
fade-in / fade-out                  /* Opacity */
zoom-in-95 / zoom-out-95            /* Scale */
slide-in-from-bottom-2              /* Translate */
data-[state=closed]:fill-mode-forwards  /* Maintient l'état final */
```

Les animations Accordion sont définies en `@theme` (pas `@theme inline`) car ce sont des keyframes, pas des tokens :

```css
@theme {
  --animate-accordion-down: accordion-down 0.2s ease-out;
  --animate-accordion-up: accordion-up 0.2s ease-out;
}
```

---

## Conventions de nommage

### Tokens CSS

| Convention | Exemple | Usage |
| :-- | :-- | :-- |
| `--{rôle}` | `--primary` | Token de couleur |
| `--{rôle}-foreground` | `--primary-foreground` | Texte sur ce rôle |
| `--{rôle}-accent` | `--primary-accent` | Hover/accent de ce rôle |
| `--gradient-{température}` | `--gradient-warm` | Stop de gradient |
| `--sidebar-{rôle}` | `--sidebar-primary` | Tokens sidebar |

### Classes CSS

| Convention | Exemple | Usage |
| :-- | :-- | :-- |
| `starwind-{nom}` | `starwind-dialog-content` | Classe d'identité pour JS |
| `data-slot="{nom}"` | `data-slot="button"` | Identifiant de composant |
| `data-state="{état}"` | `data-state="open"` | État pour animations CSS |
| `group/{nom}` | `group/card` | Groupe Tailwind pour les sous-composants |

### Fichiers

| Convention | Exemple |
| :-- | :-- |
| Dossier composant | `src/components/atoms/my-component/` |
| Composant principal | `MyComponent.astro` |
| Sous-composant | `MyComponentHeader.astro` |
| Barrel export | `index.ts` |

---

## Patterns Tailwind récurrents

### SVG auto-sizing

```css
[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
```

Empêche les SVG d'interférer, les réduit en flex, et leur donne une taille auto sauf si une classe `size-*` est explicite.

### Disabled state

```css
disabled:pointer-events-none disabled:opacity-50
```

### Focus ring

```css
outline-none focus-visible:ring-3 focus-visible:ring-{color}/50
```

### Validation error

```css
aria-invalid:border-error aria-invalid:focus-visible:ring-error/40
```

### Dark mode input

```css
dark:bg-input/30 dark:border-input
```

### Transition

```css
transition-[color,box-shadow]    /* Input, tabs */
transition-all                   /* Button, badge */
```

---

## Opacités standard

Le design system utilise un vocabulaire d'opacités cohérent :

| Opacité | Sémantique |
| :-- | :-- |
| `/7` | Background ultra-subtil (Alert bg) |
| `/10` | Background léger (Badge ghost) |
| `/12` | Bordure translucide dark |
| `/20` | Gradient léger |
| `/30` | Input dark background |
| `/40` | Focus ring subtil (error) |
| `/50` | Focus ring standard |
| `/80` | Hover badge |
| `/90` | Hover button |
