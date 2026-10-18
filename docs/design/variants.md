# Design System — Système de Variants (`tv()`)

> Retour à l'[index](index.md)

---

## Qu'est-ce que `tailwind-variants` ?

`tailwind-variants` (importé comme `tv`) est la bibliothèque de gestion de styles du design system. Chaque composant définit ses variantes CSS via un appel `tv()` exporté, combiné automatiquement par Tailwind CSS au build.

```ts
import { tv, type VariantProps } from "tailwind-variants";

export const button = tv({
  base: [...],               // Classes toujours appliquées
  variants: { ... },         // Axes de variation
  compoundVariants: [...],   // Combinaisons conditionnelles
  defaultVariants: { ... },  // Valeurs par défaut
});

type ButtonVariants = VariantProps<typeof button>;
```

---

## Anatomie d'un appel `tv()`

### `base`

Classes toujours appliquées, quel que soit l'état du variant.

```ts
base: [
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0",             // SVG sizing
  "transition-all outline-none focus-visible:ring-3",          // Focus
  "disabled:pointer-events-none disabled:opacity-50",          // Disabled
  "aria-invalid:border-error aria-invalid:focus-visible:ring-error/40", // Validation
]
```

**Convention** : le `base` est un tableau de chaînes regroupées par responsabilité (layout, SVG, focus, disabled, validation).

### `variants`

Chaque clé est un **axe de variation**. Chaque valeur est un objet de classes Tailwind :

```ts
variants: {
  variant: {           // Axe couleur
    default: "bg-foreground text-background hover:bg-foreground/90",
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    error:   "bg-error text-error-foreground hover:bg-error/90",
    // ...
  },
  size: {              // Axe taille
    sm: "h-9 px-4 text-sm",
    md: "h-11 px-5 text-base",
    lg: "h-12 px-8 text-lg",
  },
},
```

### `compoundVariants`

Styles conditionnels appliqués quand **plusieurs axes** correspondent simultanément :

```ts
compoundVariants: [
  {
    isLink: true,
    variant: "primary",
    className: "hover:bg-primary/80",   // Hover uniquement si lien + primary
  },
  {
    isLink: true,
    variant: "error",
    className: "hover:bg-error/80",
  },
],
```

**Utilisé par** : Badge (9 compoundVariants isLink × variant).

### `defaultVariants`

Valeurs appliquées quand aucun variant n'est passé :

```ts
defaultVariants: {
  variant: "default",
  size: "md",
},
```

---

## Patterns de variants dans le design system

### Pattern 1 — Axe couleur (9 variantes)

Le pattern dominant, utilisé par Button, Badge, Alert :

| Variant | Couleur | Usage |
| :-- | :-- | :-- |
| `default` | foreground | Boutons neutres |
| `primary` | primary (h=68°) | CTA principal |
| `secondary` | secondary | Actions secondaires |
| `outline` | border + bg transparent | Actions tertiaires |
| `ghost` | transparent + hover muted | Actions subtiles |
| `info` | info (sky) | Messages informatifs |
| `success` | success (green) | Confirmation |
| `warning` | warning (h=38°) | Avertissement |
| `error` | error (red) | Erreur |

### Pattern 2 — Axe taille (3 ou 6 variantes)

Composants simples (Input, Badge, Avatar) : `sm`, `md`, `lg`

Button ajoute les variantes icon : `icon-sm`, `icon`, `icon-lg`

### Pattern 3 — Multi-axes (Container : 8 axes)

Container est le composant le plus riche — 8 axes indépendants :

| Axe | Options | Description |
| :-- | --: | :-- |
| `size` | 8 | xs → full / prose |
| `gutter` | 5 | none → xl (padding horizontal) |
| `paddingY` | 5 | none → xl (padding vertical) |
| `background` | 11 | none, card, muted, primary, gradient-* |
| `border` | 6 | none, all, top, bottom, x, y |
| `rounded` | 7 | none → 3xl |
| `minHeight` | 3 | none, screen, half |
| `layout` | 3 | stack, centered, split |

### Pattern 4 — Variant booléen dérivé

Badge utilise un variant `isLink` dérivé de l'existence de `href` :

```ts
const isLink = Astro.props.href ? true : false;
// Passé dans l'appel tv() :
badge({ variant, size, isLink, class: className })
```

### Pattern 5 — Instances `tv()` multiples

Container utilise **3 instances** `tv()` pour gérer le mode `bleed` :

| Instance | Rôle | Quand |
| :-- | :-- | :-- |
| `container` | Composant unique | `bleed=false` |
| `outerStyles` | Wrapper full-width | `bleed=true` |
| `innerStyles` | Contenu contraint | `bleed=true` |

### Pattern 6 — Sous-composants via groupe CSS

Card déclare un `data-size` sur le parent :

```html
<div data-size={size ?? "default"} class="group/card ...">
```

Les sous-composants héritent via :

```ts
"group-data-[size=sm]/card:px-4"   // CardHeader
"group-data-[size=sm]/card:text-sm" // CardDescription
```

---

## Intégration TypeScript

### `VariantProps<typeof component>`

Chaque composant exporte son type via `VariantProps` :

```ts
import { tv, type VariantProps } from "tailwind-variants";

export const button = tv({ ... });

interface Props
  extends HTMLAttributes<"button">,
  Omit<HTMLAttributes<"a">, "type">,
  VariantProps<typeof button> {}
```

Cela garantit que les props `variant` et `size` sont typées automatiquement.

### Polymorphisme conditionnel

Button et Badge changent de tag HTML selon les props :

```ts
const Tag = Astro.props.href ? "a" : "button";
```

Container utilise `Polymorphic<{ as: Tag }>` pour un tag configurable :

```ts
type Props<Tag extends HTMLTag> = Polymorphic<{ as: Tag }> & VariantProps<typeof container>;
```

---

## Appliquer un variant — pattern de rendu

Tous les composants suivent exactement ce schéma :

```astro
---
const { variant, size, class: className, ...rest } = Astro.props;
---

<Tag
  class={component({ variant, size, class: className })}
  data-slot="component-name"
  {...rest}
>
  <slot />
</Tag>
```

Points clés :

- `class: className` est extrait pour être passé en dernier à `tv()` (priorité de l'override)
- `...rest` propage tous les attributs HTML (aria, data, style…)
- `data-slot` identifie le composant pour le CSS parent et les tests

---

## Résumé des composants par complexité de variants

| Composant | Axes | Compound | Polymorphic | Instances `tv()` |
| :-- | --: | :-- | :-- | --: |
| Container | 8 | — | `as` prop | 3 |
| Button | 2 (9×6) | — | href→tag | 1 |
| Badge | 3 (9×3×bool) | 9 | href→tag | 1 |
| Avatar | 2 (7×3) | — | — | 1 |
| Alert | 1 (7) | — | — | 1 |
| Card | 1 (2) | — | — | 1 |
| Input | 1 (3) | — | — | 1 |
| Dialog | — | — | — | 3 |
| Tabs | — | — | — | 4 (1/part) |
