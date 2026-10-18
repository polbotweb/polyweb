# Design System — Design Tokens

> Retour à l'[index](index.md)

---

## Espace couleur : OKLCH

Toutes les couleurs du design system sont définies en **OKLCH** (`oklch(L C H)`) :

| Paramètre | Rôle | Plage |
| :-- | :-- | :-- |
| **L** (Lightness) | Luminosité perceptuelle | 0 (noir) → 1 (blanc) |
| **C** (Chroma) | Saturation | 0 (gris) → 0.4 (max) |
| **H** (Hue) | Teinte | 0° → 360° |

### Pourquoi OKLCH ?

- **Perceptuellement uniforme** : L=0.5 produit toujours un gris moyen visible
- **Teinte stable** : changer L ne déplace pas la teinte (contrairement à HSL)
- **Contrôle du contraste** : on peut calculer le ratio WCAG directement via L
- **Support natif** : CSS moderne, tous les navigateurs modernes

---

## Axes de teinte du thème Fire Brand

| Axe | Hue | Usage |
| :-- | --: | :-- |
| **Primary** | 68° | Golden yellow — identité de marque |
| **Neutral** | 75–80° | Warm stone — surfaces, textes, bordures |
| **Warning** | 38° | Warm orange — visuellement distinct du primary |
| **Error** | ~27° | Red |
| **Success** | ~151° | Green |
| **Info** | ~212° | Sky blue |
| **Gradient warm** | 50° | Deep orange |
| **Gradient cool** | 240° | Electric blue |

---

## Tokens — Mode Light (`:root`)

### Surfaces

| Token | Valeur OKLCH | Description | Usage |
| :-- | :-- | :-- | :-- |
| `--background` | `oklch(1 0 0)` | Blanc pur | Body, page |
| `--foreground` | `oklch(0.148 0.018 75)` | Warm near-black | Texte principal |
| `--card` | `oklch(0.985 0.008 80)` | Warm off-white | Cartes, surfaces élevées |
| `--card-foreground` | `oklch(0.148 0.018 75)` | Near-black | Texte sur cartes |
| `--popover` | `oklch(0.985 0.008 80)` | Warm off-white | Popovers, dropdowns |
| `--popover-foreground` | `oklch(0.148 0.018 75)` | Near-black | Texte sur popovers |

### Primary — Golden Yellow (h=68°)

| Token | Valeur OKLCH | Contraste vs fg | Description |
| :-- | :-- | :-- | :-- |
| `--primary` | `oklch(0.880 0.200 68)` | 11:1 ✅ AAA | Golden yellow |
| `--primary-foreground` | `oklch(0.148 0.018 75)` | — | Near-black sur primary |
| `--primary-accent` | `oklch(0.820 0.205 68)` | — | Deeper yellow (hover) |
| `--primary-deep` | `oklch(0.500 0.120 68)` | ≥5:1 AA | Dark gold — texte sur fond clair (liens, eyebrows) |

### Secondary — Warm Stone

| Token | Valeur OKLCH | Contraste vs fg | Description |
| :-- | :-- | :-- | :-- |
| `--secondary` | `oklch(0.922 0.012 75)` | 12:1 ✅ AAA | Stone-200 |
| `--secondary-foreground` | `oklch(0.148 0.018 75)` | — | Near-black |
| `--secondary-accent` | `oklch(0.148 0.018 75)` | — | Near-black (hover) |

### Muted

| Token | Valeur OKLCH | Contraste vs fg | Description |
| :-- | :-- | :-- | :-- |
| `--muted` | `oklch(0.962 0.008 78)` | 8.7:1 ✅ AAA | Stone-100 bg |
| `--muted-foreground` | `oklch(0.440 0.016 75)` | — | Stone-700 text |

### Accent

| Token | Valeur OKLCH | Contraste vs fg | Description |
| :-- | :-- | :-- | :-- |
| `--accent` | `oklch(0.962 0.008 78)` | 13:1 ✅ AAA | Stone-100 bg |
| `--accent-foreground` | `oklch(0.148 0.018 75)` | — | Near-black |

### Status

| Token | Valeur OKLCH | Description |
| :-- | :-- | :-- |
| `--info` | `oklch(0.828 0.111 211.664)` | Sky-300 |
| `--info-foreground` | `oklch(0.164 0.056 232.539)` | Sky-950 |
| `--success` | `oklch(0.871 0.150 151.336)` | Green-300 |
| `--success-foreground` | `oklch(0.157 0.052 156.743)` | Green-950 |
| `--warning` | `oklch(0.870 0.200 38)` | Warm orange h=38° |
| `--warning-foreground` | `oklch(0.148 0.018 75)` | Near-black |
| `--error` | `oklch(0.444 0.177 26.899)` | Red-800 (7.7:1 ✅) |
| `--error-foreground` | `oklch(0.985 0.002 75)` | Near-white |

### Gradients

| Token | Valeur OKLCH | Description |
| :-- | :-- | :-- |
| `--gradient-warm` | `oklch(0.640 0.220 50)` | Deep orange (from) |
| `--gradient-cool` | `oklch(0.480 0.220 240)` | Electric blue (to) |

### Structurels

| Token | Valeur OKLCH | Description |
| :-- | :-- | :-- |
| `--border` | `oklch(0.882 0.016 75)` | Bordures |
| `--input` | `oklch(0.882 0.016 75)` | Bordures d'inputs |
| `--outline` | `oklch(0.652 0.020 75)` | Focus ring |
| `--radius` | `0.625rem` | Rayon de base |

### Sidebar

| Token | Valeur OKLCH |
| :-- | :-- |
| `--sidebar-background` | `oklch(0.962 0.008 78)` |
| `--sidebar-foreground` | `oklch(0.148 0.018 75)` |
| `--sidebar-primary` | `oklch(0.880 0.200 68)` |
| `--sidebar-primary-foreground` | `oklch(0.148 0.018 75)` |
| `--sidebar-accent` | `oklch(0.922 0.012 75)` |
| `--sidebar-accent-foreground` | `oklch(0.148 0.018 75)` |
| `--sidebar-border` | `oklch(0.882 0.016 75)` |
| `--sidebar-outline` | `oklch(0.652 0.020 75)` |

---

## Tokens — Mode Dark (`.dark`)

### Surfaces — Dark Tokens

| Token | Valeur OKLCH | Description |
| :-- | :-- | :-- |
| `--background` | `oklch(0.148 0.018 75)` | Warm near-black |
| `--foreground` | `oklch(0.975 0.008 80)` | Warm near-white |
| `--card` | `oklch(0.220 0.015 75)` | Stone-900 |
| `--card-foreground` | `oklch(0.975 0.008 80)` | Near-white |
| `--popover` | `oklch(0.310 0.014 75)` | Stone-800 |
| `--popover-foreground` | `oklch(0.975 0.008 80)` | Near-white |

### Primary (identique au light — identité de marque constante)

| Token | Valeur OKLCH | Notes |
| :-- | :-- | :-- |
| `--primary` | `oklch(0.880 0.200 68)` | Même golden yellow |
| `--primary-foreground` | `oklch(0.148 0.018 75)` | 11:1 ✅ AAA |
| `--primary-accent` | `oklch(0.820 0.205 68)` | Même deeper yellow |

### Secondary & Muted & Accent (inversés)

| Token | Valeur OKLCH | vs Light | Contraste |
| :-- | :-- | :-- | :-- |
| `--secondary` | `oklch(0.310 0.014 75)` | Stone-800 (inversé) | 12:1 ✅ |
| `--muted` | `oklch(0.310 0.014 75)` | Stone-800 | 8.5:1 ✅ |
| `--muted-foreground` | `oklch(0.745 0.016 75)` | Stone-400 | — |
| `--accent` | `oklch(0.410 0.018 75)` | Stone-700 | 9:1 ✅ |

### Status (identiques — pastels lisibles sur fond sombre aussi)

Mêmes valeurs que light, sauf :

| Token | Changement |
| :-- | :-- |
| `--error` | `oklch(0.505 0.213 27.325)` — Red-700, plus lumineux sur dark |
| `--gradient-warm` | `oklch(0.740 0.210 50)` — Plus vibrant |
| `--gradient-cool` | `oklch(0.590 0.215 240)` — Plus lumineux |

### Structurels (translucides en dark)

| Token | Valeur | Notes |
| :-- | :-- | :-- |
| `--border` | `oklch(1 0 0 / 12%)` | Blanc 12% — évite les artéfacts |
| `--input` | `oklch(1 0 0 / 18%)` | Blanc 18% |
| `--outline` | `oklch(0.620 0.020 75)` | Légèrement ajusté |

---

## Échelle de rayons

Tous les rayons sont dérivés du token `--radius` (0.625rem) :

| Token Tailwind | Calcul | Valeur effective |
| :-- | :-- | :-- |
| `rounded-xs` | `--radius - 0.375rem` | 0.25rem (4px) |
| `rounded-sm` | `--radius - 0.25rem` | 0.375rem (6px) |
| `rounded-md` | `--radius - 0.125rem` | 0.5rem (8px) |
| `rounded-lg` | `--radius` | 0.625rem (10px) |
| `rounded-xl` | `--radius + 0.25rem` | 0.875rem (14px) |
| `rounded-2xl` | `--radius + 0.5rem` | 1.125rem (18px) |
| `rounded-3xl` | `--radius + 1rem` | 1.625rem (26px) |

---

## Mapping Tailwind ↔ CSS Variables

Le `@theme inline` dans `global.css` mappe chaque CSS variable vers une Tailwind utility :

```css
--color-primary: var(--primary);       /* → bg-primary, text-primary, border-primary */
--color-primary-foreground: var(--primary-foreground);
--color-error: var(--error);           /* → bg-error, text-error */
--color-gradient-warm: var(--gradient-warm);
/* etc. pour chaque token */
```

Cela permet d'écrire `bg-primary` au lieu de `bg-[var(--primary)]`.

---

## Opacités courantes

Les composants utilisent des opacités Tailwind standard sur les tokens :

| Opacité | Usage |
| :-- | :-- |
| `/7` | Background subtil (Alert: `bg-primary/7`) |
| `/10` | Background léger (Badge ghost: `bg-foreground/10`) |
| `/12` | Bordures dark mode (`oklch(1 0 0 / 12%)`) |
| `/20` | Container gradient (`from-primary/20`) |
| `/30` | Input dark bg (`dark:bg-input/30`) |
| `/40` | Focus ring subtil (`ring-error/40`) |
| `/50` | Focus ring standard (`ring-primary/50`) |
| `/80` | Hover sur badges |
| `/90` | Hover sur buttons (`hover:bg-primary/90`) |
