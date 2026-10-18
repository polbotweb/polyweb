# Design System — Accessibilité

> Retour à l'[index](index.md)

---

## Niveau cible : WCAG AAA

Le design system vise le **niveau AAA** des Web Content Accessibility Guidelines (WCAG 2.2) sur tous les composants.

---

## Contraste des couleurs

### Ratios vérifiés

Tous les tokens du design system respectent les seuils suivants :

| Paire | Mode Light | Mode Dark | Seuil |
| :-- | :-- | :-- | :-- |
| `background` ↔ `foreground` | ~20:1 | ~16:1 | 7:1 AAA ✅ |
| `primary` ↔ `primary-foreground` | ~11:1 | ~11:1 | 7:1 AAA ✅ |
| `primary-deep` ↔ `background` | ~5:1 | N/A | 4.5:1 AA ✅ (texte sur fond clair) |
| `card` ↔ `card-foreground` | ~18:1 | ~14:1 | 7:1 AAA ✅ |
| `muted` ↔ `muted-foreground` | ~5:1 | ~4.5:1 | 4.5:1 AA ✅ |
| `error` ↔ `error-foreground` | ~7.7:1 | ~7:1 | 7:1 AAA ✅ |
| `warning` ↔ `warning-foreground` | ~11:1 | ~11:1 | 7:1 AAA ✅ |

### L'avantage OKLCH

Grâce à OKLCH, le contraste est **prévisible** via la différence de Lightness :

- ΔL ≥ 0.60 → ratio ≈ 7:1 (AAA)
- ΔL ≥ 0.50 → ratio ≈ 4.5:1 (AA)

Voir [tokens.md](tokens.md) pour les valeurs complètes.

---

## Focus visible

### Pattern standard

Tous les composants interactifs utilisent :

```css
outline-none focus-visible:ring-3 focus-visible:ring-{color}/50
```

| Composant | Couleur du ring |
| :-- | :-- |
| Button default | `ring-outline/50` |
| Button primary | `ring-primary/50` |
| Button error | `ring-error/50` |
| Input | `ring-outline/50` |
| TabsTrigger | `ring-outline/50` |
| Dialog close | `ring-outline/50` |

### Pourquoi `focus-visible` et pas `focus` ?

`focus-visible` n'apparaît que lors de la navigation clavier, pas au clic souris. Cela évite les anneaux de focus parasites pour les utilisateurs souris tout en garantissant la visibilité pour les utilisateurs clavier.

---

## Rôles ARIA

### Attribution automatique

Alert infère le rôle ARIA à partir du variant :

```ts
const inferredRole =
  rest.role ?? (variant === "error" || variant === "warning" ? "alert" : "status");
```

| Variant | Rôle ARIA | Comportement annonceur |
| :-- | :-- | :-- |
| `error` | `role="alert"` | Annoncé immédiatement (assertive) |
| `warning` | `role="alert"` | Annoncé immédiatement (assertive) |
| Autres | `role="status"` | Annoncé poliment (polite) |

### Rôles sur les composants composés

| Composant | Attribut | Valeur |
| :-- | :-- | :-- |
| TabsList | `role` | `tablist` |
| TabsTrigger | `role` | `tab` |
| TabsTrigger | `aria-selected` | `true/false` (dynamique) |
| TabsTrigger | `aria-controls` | ID du TabsContent associé |
| TabsContent | `role` | `tabpanel` |
| TabsContent | `aria-labelledby` | ID du TabsTrigger associé |
| DialogTrigger | `aria-haspopup` | `dialog` |
| Dialog close | `aria-label` | `"Close dialog"` |

---

## Navigation clavier

### Tabs

| Touche | Action |
| :-- | :-- |
| `ArrowRight` | Tab suivant |
| `ArrowLeft` | Tab précédent |
| `Home` | Premier tab |
| `End` | Dernier tab |
| `Enter / Space` | Active le tab focusé |

L'implémentation utilise `roving tabindex` — seul le tab actif a `tabindex="0"`, les autres ont `tabindex="-1"`.

### Dialog

| Touche | Action |
| :-- | :-- |
| `Escape` | Ferme le dialog |
| `Tab` | Navigue dans le contenu (focus trap) |

### Select

| Touche | Action |
| :-- | :-- |
| `ArrowDown` | Option suivante |
| `ArrowUp` | Option précédente |
| `Home` | Première option |
| `End` | Dernière option |
| `Enter` | Sélectionne l'option |
| `Escape` | Ferme le dropdown |
| Caractère | Typeahead — saute à l'option correspondante |

---

## États désactivés

Pattern cohérent sur tous les composants interactifs :

```css
disabled:pointer-events-none disabled:opacity-50
```

- `pointer-events-none` empêche toute interaction souris
- `opacity-50` donne un signal visuel clair de l'état désactivé
- Le ratio de contraste diminué est **accepté par WCAG** pour les éléments désactivés

---

## Validation de formulaire

### Pattern `aria-invalid`

Tous les composants de formulaire (Input, Textarea, Select) supportent :

```css
aria-invalid:border-error aria-invalid:focus-visible:ring-error/40
```

Quand `aria-invalid="true"` est sur l'input :

1. La bordure passe en `border-error` (rouge)
2. Le ring de focus passe en `ring-error/40`
3. L'erreur est communiquée aux lecteurs d'écran

---

## Support RTL (Right-to-Left)

Le BaseLayout gère la direction via l'attribut `dir` sur `<html>` :

```html
<html lang={lang} dir={dir}>
```

La direction est déterminée automatiquement à partir de la locale i18n :

| Locale | Direction |
| :-- | :-- |
| `en`, `fr`, `es` | `ltr` |
| `ar` | `rtl` |

Les composants qui utilisent `gap`, `flex`, `grid`, `px` et les Tailwind utilities logiques (`ms-`, `me-`, `ps-`, `pe-`) s'adaptent automatiquement.

---

## Éléments décoratifs

Les composants d'animation (wow/) qui sont purement visuels utilisent :

```html
<div aria-hidden="true" class="pointer-events-none">
  <!-- Particles, gradients, effets visuels -->
</div>
```

- `aria-hidden="true"` exclut du arbre d'accessibilité
- `pointer-events-none` empêche l'interférence avec les interactions

---

## HTML sémantique

| Composant | Élément | Raison |
| :-- | :-- | :-- |
| Avatar | `<figure>` | Image avec contenu sémantique |
| Alert | `<div role="alert/status">` | Zone de message dynamique |
| DialogTitle | `<h2>` | Titre de section modale |
| Card | `<div>` avec `data-slot` | Container générique |
| Button | `<button>` / `<a>` | Action / navigation |
| Input | `<input>` | Champ de formulaire natif |
| TabsList | `<div role="tablist">` | Widget tab |

---

## Checklist accessibilité

Pour chaque nouveau composant, vérifier :

- [ ] Contraste ≥ 7:1 (AAA) sur les textes primaires
- [ ] `focus-visible:ring-3` sur tous les éléments interactifs
- [ ] `disabled:pointer-events-none disabled:opacity-50` si désactivable
- [ ] `aria-invalid` support si champ de formulaire
- [ ] Rôles ARIA appropriés (tab, tablist, tabpanel, dialog, alert…)
- [ ] Navigation clavier complète (flèches, Escape, Enter)
- [ ] `aria-hidden="true"` sur les éléments purement décoratifs
- [ ] Texte alternatif ou `aria-label` si pas de contenu textuel visible
- [ ] Fonctionne en RTL (pas de `left`/`right` hardcodé, utiliser `start`/`end`)
