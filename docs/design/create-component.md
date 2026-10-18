# Design System — Créer un composant

> Retour à l'[index](index.md)

---

## Prérequis

- Connaître le système de [tokens](tokens.md) et de [variants](variants.md)
- Comprendre l'architecture Atomic Design : `atoms/ → molecules/ → organisms/`

---

## Structure de fichiers

Chaque composant Starwind vit dans son propre dossier sous `src/components/atoms/` :

```md
src/components/atoms/my-component/
├── MyComponent.astro     ← Composant principal
├── MyComponentSub.astro  ← Sous-composant (si nécessaire)
└── index.ts              ← Réexportation publique
```

**Convention de nommage** : PascalCase pour le fichier et le composant, kebab-case pour le dossier.

---

## Étape 1 — Définir les variants avec `tv()`

Commencer par l'appel `tv()` exporté, avant le template :

```astro
---
import type { HTMLAttributes } from "astro/types";
import { tv, type VariantProps } from "tailwind-variants";

export const myComponent = tv({
  base: [
    // Layout + typographie
    "inline-flex items-center gap-2 rounded-md font-medium",
    // SVG (si le composant contient des icônes)
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    // Focus
    "outline-none focus-visible:ring-3",
    // Disabled
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  variants: {
    variant: {
      default:   "bg-foreground text-background",
      primary:   "bg-primary text-primary-foreground",
      secondary: "bg-secondary text-secondary-foreground",
    },
    size: {
      sm: "h-9 px-3 text-sm",
      md: "h-11 px-4 text-base",
      lg: "h-12 px-6 text-lg",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
  },
});
```

### Règles de design obligatoires

1. **Utiliser uniquement des tokens** du design system — jamais de couleurs codées en dur
2. **Focus visible** : `focus-visible:ring-3 focus-visible:ring-{color}/50`
3. **Disabled** : `disabled:pointer-events-none disabled:opacity-50`
4. **Validation** : `aria-invalid:border-error aria-invalid:focus-visible:ring-error/40`
5. **SVG auto-size** : `[&_svg:not([class*='size-'])]:size-{n}`
6. **Dark mode** : utiliser les tokens CSS (pas de `dark:` hardcodé sauf pour `bg-input/30`)

---

## Étape 2 — Typer les Props

```astro
---
interface Props extends HTMLAttributes<"div">, VariantProps<typeof myComponent> {}

const { variant, size, class: className, ...rest } = Astro.props;
---
```

**Pattern polymorphique** (si le composant change de tag selon les props) :

```astro
---
interface Props
  extends HTMLAttributes<"button">,
    Omit<HTMLAttributes<"a">, "type">,
    VariantProps<typeof myComponent> {}

const { variant, size, class: className, ...rest } = Astro.props;
const Tag = Astro.props.href ? "a" : "button";
---
```

---

## Étape 3 — Template de rendu

```astro
<Tag
  class={myComponent({ variant, size, class: className })}
  data-slot="my-component"
  {...rest}
>
  <slot />
</Tag>
```

### Conventions du template

| Convention | Exemple | Raison |
| :-- | :-- | :-- |
| `data-slot="nom"` | `data-slot="button"` | Ciblage CSS parent + tests |
| `class={tv({ class: className })}` | `class` passé en dernier | Override consommateur |
| `{...rest}` | Après `class` et `data-slot` | Props HTML arbitraires |
| `<slot />` | Contenu enfant | Composition Astro |

---

## Étape 4 — Sous-composants (composition)

Pour les composants composés (Card, Dialog, Tabs…), chaque sous-composant est un fichier séparé.

### Communication parent → enfants via groupe CSS

**Parent** (Card.astro) :

```astro
<div
  class={card({ size, class: className })}
  data-size={size ?? "default"}
  data-slot="card"
  {...rest}
>
  <slot />
</div>
```

Le `class="group/card"` est inclus dans le `base` du `tv()`.

**Enfant** (CardHeader.astro) :

```ts
export const cardHeader = tv({
  base: [
    "px-6 group-data-[size=sm]/card:px-4",  // Hérite du size parent
  ],
});
```

### Communication via `has-data-[slot=...]`

Card utilise les data-slots des enfants pour ajuster son layout :

```ts
"has-data-[slot=card-footer]:pb-0"           // Pas de padding bas si footer présent
"has-data-[slot=card-action]:grid-cols-[1fr_auto]" // Grid si action présente
```

---

## Étape 5 — Slots nommés

Pour les composants avec plusieurs zones de contenu :

```astro
<div class={myComponent({ variant, class: className })} data-slot="my-component" {...rest}>
  <slot name="icon" />
  <div class="flex-1">
    <slot />
  </div>
  <slot name="action" />
</div>
```

Exemples dans le design system :

- **ThemeToggle** : `<slot name="light-icon" />`, `<slot name="dark-icon" />`
- **Container** : `<slot name="media" />`

---

## Étape 6 — Export et index

Créer le barrel export :

```ts
// src/components/atoms/my-component/index.ts
export { default as MyComponent } from "./MyComponent.astro";
export { myComponent } from "./MyComponent.astro";  // Réexport du tv()

// Si sous-composants :
export { default as MyComponentHeader } from "./MyComponentHeader.astro";
export { default as MyComponentContent } from "./MyComponentContent.astro";
```

---

## Étape 7 — Enregistrement Starwind (optionnel)

Si le composant fait partie du registre Starwind, ajouter dans `starwind.config.json` :

```json
{
  "components": [
    { "name": "my-component", "version": "1.0.0" }
  ]
}
```

---

## Checklist de validation

Avant de merger un nouveau composant :

- [ ] `tv()` exporté avec `base`, `variants`, `defaultVariants`
- [ ] Props typés avec `VariantProps<typeof component>`
- [ ] `data-slot` sur l'élément racine
- [ ] `class: className` passé en dernier dans `tv()`
- [ ] `{...rest}` pour la propagation des attributs HTML
- [ ] Focus visible avec `ring-3`
- [ ] État disabled si interactif
- [ ] État `aria-invalid` si formulaire
- [ ] Pas de couleurs hardcodées — tokens uniquement
- [ ] Fonctionne en light ET dark mode
- [ ] Pas de dépendance JS sauf si strictement nécessaire
- [ ] Tests ajoutés pour les variants critiques

---

## Anti-patterns à éviter

| Anti-pattern | Correction |
| :-- | :-- |
| `bg-yellow-500` | `bg-primary` (utiliser le token) |
| `class:list` conditionnel | `tv()` avec variants |
| `dark:bg-gray-800` | `dark:bg-input/30` ou token automatique |
| Styles inline | `tv()` base ou variant |
| Pas de `data-slot` | Toujours ajouter pour ciblage |
| Props non typés | `VariantProps<typeof component>` |
| Oublier `{...rest}` | Props HTML perdues (aria, data…) |
