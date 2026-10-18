# Design System — Theming

> Retour à l'[index](index.md)

---

## Architecture du thème

Le design system utilise des **CSS variables** comme contrat entre les tokens et les composants. Pour créer un thème, il suffit de redéfinir ces variables dans `:root` et `.dark`.

```text
starwind.config.json  →  Composant choisit un token  →  Token résolu via CSS variable
                         bg-primary                     var(--primary) = oklch(...)
```

Aucun composant ne contient de couleur hardcodée. **Changer les variables change tout le design system.**

---

## Thème actuel : Fire Brand

### Identité chromatique

| Axe | Hue OKLCH | Caractère |
| :-- | --: | :-- |
| Primary | 68° | Golden yellow — chaleureux, énergique |
| Neutral | 75–80° | Warm stone — terreux, organique |
| Warning | 38° | Warm orange — distinct du primary |

### Principes du thème

1. **Primary identique en light et dark** — la marque ne change pas avec le mode
2. **Surfaces inversées** — background/foreground permutent, les couleurs status restent
3. **Bordures translucides en dark** — `oklch(1 0 0 / 12%)` évite les artefacts
4. **Gradients plus vibrants en dark** — compensent le fond sombre

---

## Créer un thème personnalisé

### Méthode : override des CSS variables

Créer un fichier CSS ou une classe qui redéfinit les tokens :

```css
/* themes/luxury.css */
:root {
  /* Surfaces */
  --background: oklch(0.985 0.005 60);
  --foreground: oklch(0.15 0.015 60);
  --card: oklch(0.97 0.008 60);
  --card-foreground: oklch(0.15 0.015 60);
  --popover: oklch(0.97 0.008 60);
  --popover-foreground: oklch(0.15 0.015 60);

  /* Primary — Doré profond */
  --primary: oklch(0.75 0.18 85);
  --primary-foreground: oklch(0.15 0.015 60);
  --primary-accent: oklch(0.68 0.19 85);

  /* Secondary */
  --secondary: oklch(0.90 0.01 60);
  --secondary-foreground: oklch(0.15 0.015 60);
  --secondary-accent: oklch(0.15 0.015 60);

  /* Muted */
  --muted: oklch(0.95 0.005 60);
  --muted-foreground: oklch(0.45 0.015 60);

  /* Accent */
  --accent: oklch(0.95 0.005 60);
  --accent-foreground: oklch(0.15 0.015 60);

  /* Status — gardez des teintes universellement reconnaissables */
  --info: oklch(0.83 0.11 212);
  --info-foreground: oklch(0.16 0.056 233);
  --success: oklch(0.87 0.15 151);
  --success-foreground: oklch(0.16 0.052 157);
  --warning: oklch(0.87 0.20 45);
  --warning-foreground: oklch(0.15 0.015 60);
  --error: oklch(0.44 0.18 27);
  --error-foreground: oklch(0.985 0.002 60);

  /* Gradients */
  --gradient-warm: oklch(0.64 0.18 55);
  --gradient-cool: oklch(0.48 0.18 250);

  /* Structure */
  --border: oklch(0.88 0.010 60);
  --input: oklch(0.88 0.010 60);
  --outline: oklch(0.65 0.015 60);
  --radius: 0.5rem;
}

.dark {
  --background: oklch(0.12 0.012 60);
  --foreground: oklch(0.97 0.005 60);
  --card: oklch(0.18 0.010 60);
  --card-foreground: oklch(0.97 0.005 60);
  --popover: oklch(0.25 0.010 60);
  --popover-foreground: oklch(0.97 0.005 60);

  --primary: oklch(0.75 0.18 85);
  --primary-foreground: oklch(0.12 0.012 60);
  --primary-accent: oklch(0.68 0.19 85);

  --secondary: oklch(0.25 0.010 60);
  --secondary-foreground: oklch(0.97 0.005 60);
  --secondary-accent: oklch(0.97 0.005 60);

  --muted: oklch(0.25 0.010 60);
  --muted-foreground: oklch(0.70 0.012 60);

  --accent: oklch(0.35 0.012 60);
  --accent-foreground: oklch(0.97 0.005 60);

  --error: oklch(0.50 0.21 27);
  --gradient-warm: oklch(0.74 0.18 55);
  --gradient-cool: oklch(0.59 0.18 250);

  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --outline: oklch(0.62 0.015 60);
}
```

---

## Exemples de palettes thématiques

### Retro (hue ≈ 25° — Terracotta)

```css
:root {
  --primary: oklch(0.72 0.16 25);          /* Terracotta chaud */
  --primary-foreground: oklch(0.98 0.005 25);
  --primary-accent: oklch(0.65 0.17 25);
  --radius: 0.25rem;                        /* Coins plus carrés */
}
```

**Caractère** : nostalgique, artisanal, organique.

### Modern (hue ≈ 250° — Electric indigo)

```css
:root {
  --primary: oklch(0.60 0.25 265);         /* Indigo électrique */
  --primary-foreground: oklch(0.98 0.005 265);
  --primary-accent: oklch(0.53 0.26 265);
  --radius: 0.75rem;                        /* Coins arrondis */
}
```

**Caractère** : technologique, audacieux, dynamique.

### Futurist (hue ≈ 175° — Cyan néon)

```css
:root {
  --primary: oklch(0.85 0.20 175);         /* Cyan néon */
  --primary-foreground: oklch(0.10 0.02 175);
  --primary-accent: oklch(0.78 0.22 175);
  --gradient-warm: oklch(0.70 0.22 175);
  --gradient-cool: oklch(0.55 0.25 290);   /* Violet néon */
  --radius: 1rem;                           /* Très arrondi */
}
```

**Caractère** : high-tech, lumineux, science-fiction.

### Luxury (hue ≈ 85° — Or profond)

```css
:root {
  --primary: oklch(0.75 0.18 85);          /* Or profond */
  --primary-foreground: oklch(0.12 0.01 60);
  --primary-accent: oklch(0.68 0.19 85);
  --background: oklch(0.985 0.005 60);     /* Crème chaud */
  --radius: 0.375rem;                       /* Coins raffinés */
}
```

**Caractère** : élégant, premium, classique.

### Zen (hue ≈ 145° — Vert sauge)

```css
:root {
  --primary: oklch(0.72 0.10 145);         /* Vert sauge doux */
  --primary-foreground: oklch(0.15 0.02 145);
  --primary-accent: oklch(0.65 0.12 145);
  --background: oklch(0.98 0.008 90);      /* Papier naturel */
  --muted: oklch(0.95 0.01 100);
  --radius: 0.875rem;                       /* Doux et organique */
}
```

**Caractère** : calme, naturel, apaisant.

---

## Règles pour maintenir l'accessibilité

### Contraste WCAG AAA (7:1)

Quand vous modifiez les couleurs, vérifiez :

| Paire | Ratio minimum |
| :-- | :-- |
| `primary` ↔ `primary-foreground` | 7:1 (AAA) |
| `background` ↔ `foreground` | 7:1 (AAA) |
| `card` ↔ `card-foreground` | 7:1 (AAA) |
| `muted` ↔ `muted-foreground` | 4.5:1 (AA minimum) |
| `error` ↔ `error-foreground` | 7:1 (AAA) |

### Formule rapide OKLCH pour le contraste

En OKLCH, le contraste approximatif est lié à la différence de Lightness (L) :

| ΔL minimum | Ratio approximatif |
| :-- | :-- |
| 0.50 | ~4.5:1 (AA) |
| 0.60 | ~7:1 (AAA) |
| 0.70+ | ~10:1+ |

Exemple : `--primary: oklch(0.88 ...)` + `--primary-foreground: oklch(0.15 ...)` → ΔL = 0.73 → ≈11:1 ✅

### Warning vs Primary

Le hue du warning (38°) DOIT rester distinct du primary (68°) pour que les daltoniens puissent les différencier. Écart minimum recommandé : **20° de hue**.

---

## Mécanisme de basculement Light ↔ Dark

### Côté CSS

```css
:root { /* tokens light */ }
.dark { /* tokens dark */ }
```

Tailwind applique automatiquement les classes `dark:` quand `.dark` est sur `<html>`.

### Côté JavaScript (ThemeToggle)

1. Au chargement : lit `localStorage.getItem("colorTheme")` ou `prefers-color-scheme`
2. Applique/retire `class="dark"` sur `<html>`
3. Au toggle : met à jour le localStorage et dispatche `CustomEvent("theme:change")`
4. Tous les ThemeToggle se synchronisent via l'événement

### Astro View Transitions

Le ThemeToggle écoute `astro:after-swap` pour ré-appliquer le thème après une navigation SPA, avec un guard `WeakMap` + `Set` pour éviter les doublons.

---

## Personnaliser le border-radius global

Le token `--radius` contrôle toute l'échelle :

| Valeur | Caractère |
| :-- | :-- |
| `0rem` | Brutalist, industriel |
| `0.25rem` | Retro, rectangulaire |
| `0.5rem` | Classique, équilibré |
| `0.625rem` | Fire Brand (défaut) |
| `0.875rem` | Soft, moderne |
| `1rem+` | Futuriste, organique |

---

## Gestion des thèmes via l'admin CMS

En plus des fichiers CSS manuels, les thèmes peuvent être créés et gérés depuis l'interface d'administration CMS.

### Page Admin Theme

**Route** : `/[lang]/admin/theme`  
**Composant** : `src/components/pages/admin/AdminThemePage.astro`

L'interface permet :

| Action | Description |
| :-- | :-- |
| **Créer un thème** | Formulaire avec nom du thème + tous les tokens de couleur |
| **Modifier un thème** | Accordion par thème, champs pré-remplis |
| **Activer un thème** | Un seul thème actif à la fois, appliqué globalement |
| **Supprimer un thème** | Avec confirmation (impossible si c'est le thème actif) |

### Tokens gérés en base

Le schéma `themeSettings` stocke tous les design tokens en base de données :

| Champ | Type | Exemple |
| :-- | :-- | :-- |
| `primaryColor` | text | `oklch(0.88 0.18 68)` |
| `secondaryColor` | text | `oklch(0.90 0.01 80)` |
| `accentColor` | text | `oklch(0.95 0.005 75)` |
| `backgroundColor` | text | `oklch(0.985 0.005 75)` |
| `foregroundColor` | text | `oklch(0.145 0.02 75)` |
| `mutedColor` | text | `oklch(0.945 0.005 75)` |
| `mutedForegroundColor` | text | `oklch(0.47 0.015 75)` |
| `fontHeading` | text | `Inter` |
| `fontBody` | text | `Inter` |
| `borderRadius` | text | `0.625rem` |
| `isDefault` | boolean | Thème par défaut (non supprimable) |
| `isActive` | boolean | Thème actuellement appliqué |

### Actions Astro

| Action | Fichier | Description |
| :-- | :-- | :-- |
| `createTheme` | `src/actions/admin/theme.ts` | Crée un thème en base |
| `updateTheme` | `src/actions/admin/theme.ts` | Met à jour un thème (+ activation) |
| `deleteTheme` | `src/actions/admin/theme.ts` | Supprime (interdit si actif) |

### Loader

```ts
import { getActiveTheme, getAllThemes } from '@database/loaders/site.loader';

const active = await getActiveTheme();     // thème actif actuel
const themes = await getAllThemes();        // tous les thèmes
```

### Flux de données

```text
Admin UI → Astro Action → DB (themeSettings) → Loader → BaseLayout → CSS variables
```

Le `BaseLayout` charge le thème actif via `getActiveTheme()` et injecte les CSS variables dans `<style>` pour que tout le design system s'adapte automatiquement.
