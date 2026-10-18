# Design System — Animations & Effets Visuels (Wow)

> Retour à l'[index](index.md)

---

## Vue d'ensemble

Le dossier `src/components/wow/` contient 8 composants d'effets visuels. Aucun n'utilise de bibliothèque d'animation externe — uniquement **CSS natif** et **vanilla JavaScript**.

| Composant | Technique | JS requis | GPU hint |
| :-- | :-- | :-- | :-- |
| ScrollReveal | IntersectionObserver + CSS transition | Oui | Non |
| HoverBlurCards | CSS @keyframes + :hover | Non | Non |
| FallingParticles | CSS @keyframes `fall` | Non | `will-change` |
| RisingParticles | CSS @keyframes `rise` | Non | `will-change` |
| MouseRepelParticles | requestAnimationFrame + CSS @property | Oui | `will-change` |
| MarqueeContent | CSS @keyframes + JS pause/play | Oui (minimal) | Non |
| LogoCloud | CSS @keyframes + JS pause/play | Oui (minimal) | Non |
| AsyncButton | CSS transition + Custom Element | Oui | Non |

---

## ScrollReveal

Révèle un élément au scroll avec un fade + translation directionnelle.

### Props

| Prop | Type | Défaut | Description |
| :-- | :-- | :-- | :-- |
| `direction` | `"up" \| "down" \| "left" \| "right"` | `"up"` | Direction d'entrée |
| `delay` | `number` (ms) | `0` | Délai avant animation |
| `duration` | `number` (ms) | `600` | Durée de la transition |
| `distance` | `number` (px) | `20` | Distance de translation |
| `once` | `boolean` | `true` | Animation une seule fois |
| `threshold` | `number` (0–1) | `0.1` | Pourcentage visible pour déclencher |

### Mécanique

1. Élément initialisé avec `opacity: 0` et `transform: translateY(20px)` (selon direction)
2. `IntersectionObserver` surveille l'entrée dans le viewport
3. Quand visible → retire le transform, passe `opacity: 1`
4. Si `once=true`, l'observer se déconnecte après la première animation
5. Écoute `astro:after-swap` pour réinitialiser après navigation SPA

### Usage

```astro
<ScrollReveal direction="up" delay={200} duration={800}>
  <h2>Titre animé</h2>
</ScrollReveal>
```

---

## HoverBlurCards

Grid de cartes avec effet blur au hover : la carte survolée reste nette, les autres deviennent floues.

### Props HoverBlurCards

| Prop | Type | Description |
| :-- | :-- | :-- |
| `cards` | `HoverBlurCardItem[]` | `{ icon, title, description }` |

### Mécanique HoverBlurCards

Entièrement CSS — aucun JavaScript :

```css
@keyframes blur-card-enter {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Au hover du container, blur toutes les cartes */
.starwind-hover-blur:hover > div {
  opacity: 0.5;
  filter: blur(2px);
}

/* Sauf la carte survolée */
.starwind-hover-blur > div:hover {
  opacity: 1;
  filter: blur(0);
}
```

Chaque carte a un `animation-delay` staggeré de `i * 150ms`.

### Usage HoverBlurCards

```astro
<HoverBlurCards cards={[
  { icon: "🚀", title: "Performance", description: "..." },
  { icon: "🎨", title: "Design", description: "..." },
]} />
```

---

## FallingParticles

Particules qui tombent doucement du haut vers le bas de la zone.

### Props FallingParticles

| Prop | Type | Défaut | Description |
| :-- | :-- | :-- | :-- |
| `particleCount` | `number` | `50` | Nombre de particules |
| `minSize` | `number` (px) | `2` | Taille minimum |
| `maxSize` | `number` (px) | `6` | Taille maximum |
| `minDuration` | `number` (s) | `8` | Durée minimum d'un cycle |
| `maxDuration` | `number` (s) | `20` | Durée maximum d'un cycle |
| `particleColor` | `string` | `"currentColor"` | Couleur CSS |
| `minOpacity` | `number` | `0.1` | Opacité minimum |
| `maxOpacity` | `number` | `0.5` | Opacité maximum |

### Mécanique FallingParticles

Zéro JavaScript. Les particules sont générées **au build** (côté serveur) avec des valeurs aléatoires :

```css
@keyframes fall {
  0%   { transform: translateY(0) translateX(0); opacity: 0; }
  10%  { opacity: var(--particle-opacity); }
  90%  { opacity: var(--particle-opacity); }
  100% { transform: translateY(100vh) translateX(var(--drift)); opacity: 0; }
}
```

Chaque particule a :

- Position X aléatoire (`left: random%`)
- Taille aléatoire entre min/max
- Durée aléatoire entre min/max
- Drift horizontal aléatoire (CSS variable `--drift`)
- `will-change: transform, opacity` pour GPU acceleration
- `animation-fill-mode: backwards` pour démarrage propre

### Usage FallingParticles

```astro
<FallingParticles particleCount={80} particleColor="oklch(0.88 0.20 68)" />
```

---

## RisingParticles

Identique à FallingParticles mais en **sens inverse** — les particules montent du bas vers le haut.

### Différences avec FallingParticles

| Aspect | FallingParticles | RisingParticles |
| :-- | :-- | :-- |
| Direction | ↓ Descend | ↑ Monte |
| Position initiale | `top: 0` | `bottom: 0` |
| @keyframes | `translateY(100vh)` | `translateY(-100vh)` |

Mêmes props, même technique CSS, même performance.

---

## MouseRepelParticles

Particules statiques qui s'écartent au passage de la souris, puis reviennent à leur position avec un effet élastique.

### Props MouseRepelParticles

| Prop | Type | Défaut | Description |
| :-- | :-- | :-- | :-- |
| `particleCount` | `number` | `80` | Nombre de particules |
| `minSize` / `maxSize` | `number` (px) | `2` / `5` | Taille |
| `particleColor` | `string` | `"currentColor"` | Couleur |
| `minOpacity` / `maxOpacity` | `number` | `0.15` / `0.6` | Opacité |
| `repelRadius` | `number` (px) | `150` | Rayon d'influence de la souris |
| `repelStrength` | `number` | `1` | Force de répulsion |
| `snapBackDuration` | `number` (ms) | `300` | Durée du retour élastique |

### Mécanique MouseRepelParticles

Le composant le plus complexe, combinant :

1. **CSS `@property`** pour animer des variables CSS avec transitions :

   ```css
   @property --push-x { syntax: "<number>"; inherits: false; initial-value: 0; }
   @property --push-y { syntax: "<number>"; inherits: false; initial-value: 0; }
   ```

2. **requestAnimationFrame** pour calculer les distances souris → particules :

   ```js
   // Boucle RAF active UNIQUEMENT quand la souris est dans le container
   // Distance au carré pour éviter Math.sqrt() dans la boucle chaude
   const distSq = dx * dx + dy * dy;
   ```

3. **Snap-back élastique** via `cubic-bezier(0.34, 1.56, 0.64, 1)` sur les transitions CSS

### Optimisations performance

- `ResizeObserver` cache les dimensions du container (évite reflow)
- `requestAnimationFrame` ne tourne que pendant le hover (pas en idle)
- `cancelAnimationFrame` au mouse leave
- `data-initialized` flag anti-duplication
- Positions des particules cachées en mémoire (pas de lecture DOM à chaque frame)
- `will-change: --push-x, --push-y` pour GPU

### Usage MouseRepelParticles

```astro
<MouseRepelParticles
  particleCount={100}
  repelRadius={200}
  repelStrength={1.5}
  particleColor="oklch(0.88 0.20 68)"
/>
```

---

## MarqueeContent

Défilement horizontal continu de contenu (cartes, images) sur deux rangées avec directions opposées.

### Props MarqueeContent

| Prop | Type | Description |
| :-- | :-- | :-- |
| `badge` | `string` | Badge texte au-dessus du titre |
| `heading` | `string` | Titre principal |
| `description` | `string` | Description |
| `row1` | `FeatureMarqueeItem[]` | Items première rangée |
| `row2` | `FeatureMarqueeItem[]` | Items seconde rangée (inversée) |

Chaque `FeatureMarqueeItem` : `{ src, alt, title, tagline }`

### Mécanique MarqueeContent

```css
@keyframes feature-25-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(calc(-100% - var(--gap))); }
}
```

- Le contenu est **dupliqué** pour créer un loop seamless
- La seconde rangée utilise `animation-direction: reverse`
- CSS variable `--gap` et `--duration` pour le tuning
- **Pause au hover** via JS : `animationPlayState = "paused"/"running"`

### Usage MarqueeContent

```astro
<MarqueeContent
  badge="Showcase"
  heading="Nos réalisations"
  row1={[{ src: "/img/1.jpg", alt: "...", title: "Projet A", tagline: "..." }]}
  row2={[{ src: "/img/2.jpg", alt: "...", title: "Projet B", tagline: "..." }]}
/>
```

---

## LogoCloud

Défilement horizontal continu de logos avec fade sur les bords.

### Props LogoCloud

| Prop | Type | Description |
| :-- | :-- | :-- |
| `logos` | `LogoData[]` | `{ name, src }` |

### Mécanique LogoCloud

Même pattern que MarqueeContent :

```css
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(calc(-100% - var(--gap))); }
}
```

- Gradients de fade sur les côtés (`bg-linear-to-r from-background`, `bg-linear-to-l from-background`)
- Pause au hover
- Logos dupliqués pour seamless loop
- `animation: marquee 25s linear infinite`

---

## Bonnes pratiques animations

### Performance

| Règle | Raison |
| :-- | :-- |
| Préférer CSS `@keyframes` à JS | Exécuté sur le GPU compositor thread |
| `will-change` sur les transforms | Crée un layer GPU dédié |
| RAF uniquement quand nécessaire | Ne tourne pas en idle |
| Cleanup systématique | `cancelAnimationFrame`, disconnect observers |
| Build-time rendering | Particules générées côté serveur |

### Accessibilité

| Règle | Implementation |
| :-- | :-- |
| `aria-hidden="true"` | Sur tous les containers de particules |
| `pointer-events-none` | Pas d'interférence avec le contenu |
| Pas de `prefers-reduced-motion` | À ajouter si nécessaire |

### Astro View Transitions

Tous les composants JS écoutent `astro:after-swap` pour se réinitialiser après une navigation SPA, avec des guards anti-duplication (`data-initialized`, `WeakMap`).
