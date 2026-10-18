# Créer des données de seed

Guide pas à pas pour ajouter des données initiales (seed) pour une table.

## Prérequis

- Le schéma Drizzle de la table doit exister dans `src/database/schemas/`
- Le schéma doit être exporté dans `src/database/schemas.ts`

## 1. Créer le fichier de données

Créez un fichier dans `src/database/data/` :

```ts
// src/database/data/01-products.data.ts
export const productsData = [
  {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Widget Pro',
    price: 2999,
  },
  {
    id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    name: 'Widget Lite',
    price: 999,
  },
];
```

### Conventions de nommage

- Préfixe numérique pour l'ordre visuel : `01-products.data.ts`, `02-orders.data.ts`
- Suffixe `.data.ts` obligatoire
- Exportez un tableau nommé (le seed prend le premier `Array` trouvé dans le module)

## 2. Ajouter au manifest

Éditez `src/database/data/manifest.ts` :

```ts
export const seedManifest: SeedEntry[] = [
  { dataFile: '01-products.data.ts', schemaExport: 'products', label: 'products' },
  { dataFile: '02-orders.data.ts', schemaExport: 'orders', label: 'orders' },
];
```

> **Important** : L'ordre du tableau détermine l'ordre d'insertion. Placez les tables parentes avant les tables enfants pour respecter les clés étrangères.

| Champ | Description |
| --- | --- |
| `dataFile` | Nom du fichier dans `src/database/data/` |
| `schemaExport` | Nom de l'export dans `schemas.ts` (ex: `products`, `orders`) |
| `label` | Label affiché dans les logs |

## 3. Lancer le seed

```bash
pnpm run db:seed             # insère les données (ignore les doublons)
pnpm run db:seed -- --reset  # vide les tables puis insère
```

## Structure des fichiers

```md
src/database/
├── data/
│   ├── manifest.ts                  ← source de vérité : ordre + mapping
│   ├── 03-site-settings.data.ts     ← paramètres site ×4 locales
│   ├── 04-social-links.data.ts      ← liens sociaux
│   ├── 05-contact-info.data.ts      ← coordonnées + géolocalisation
│   ├── 06-opening-hours.data.ts     ← horaires ×7 jours + pause méridienne
│   ├── 07-navigation.data.ts        ← menus (header, footer_primary, footer_secondary, footer_legal)
│   ├── 07b-navigation-items.data.ts ← items de navigation ×4 locales
│   └── 08-theme.data.ts             ← thème design (couleurs, fonts, CSS)
├── schemas/
│   ├── site.schema.ts
│   ├── navigation.schema.ts
│   ├── page.schema.ts
│   └── audit-log.schema.ts
└── schemas.ts                       ← index de re-export
```

### Seed CMS — Détail des données

| Fichier | Table | Champs clés |
| :-- | :-- | :-- |
| `03-site-settings` | `siteSettings` | `siteName`, `siteDescription`, `siteSlogan`, `metaTitle`, `metaDescription`, `logoLight`, `logoDark`, `favicon`, `ogImage` ×4 locales |
| `04-social-links` | `socialLinks` | `platform`, `url`, `label`, `icon`, `isActive`, `sortOrder` |
| `05-contact-info` | `contactInfo` | `email`, `phone`, `address`, `city`, `postalCode`, `country`, `mapUrl`, `latitude`, `longitude` |
| `06-opening-hours` | `openingHours` | `dayOfWeek` (0-6), `isClosed`, `openTime`/`closeTime`, `morningOpen/Close`, `afternoonOpen/Close` (pause méridienne) |
| `07-navigation` | `navigationMenus` | `name` (header, footer_primary, footer_secondary, footer_legal) |
| `07b-navigation-items` | `navigationItems` | `label`, `url`, `icon` (mdi:xxx), `sortOrder`, `parentId`, `isActive`, `openInNewTab` ×4 locales |
| `08-theme` | `themeSettings` | couleurs (primary, secondary, accent, background, foreground, muted), `fontHeading`, `fontBody`, `borderRadius` |

## Normalisation automatique

Le script de seed normalise automatiquement :

- `boolean` → `0` ou `1`
- `Array` → `JSON.stringify()`

## Résolution des erreurs courantes

| Erreur | Cause | Solution |
| --- | --- | --- |
| `Export "xxx" introuvable dans schemas.ts` | `schemaExport` ne correspond à aucun export | Vérifiez le nom exact dans `schemas.ts` |
| `Dataset vide ou introuvable` | Le fichier ne contient pas de tableau exporté | Exportez un tableau (`export const data = [...]`) |
| Erreur FK / constraint violation | Ordre d'insertion incorrect | Déplacez l'entrée après sa dépendance dans le manifest |
