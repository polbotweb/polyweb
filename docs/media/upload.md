# Media Upload — Upload d'images local

Upload d'images 100% local dans `public/uploads/`. Réutilisable pour avatars, logos d'organisation, et futur blog.

## Endpoint

```md
POST /api/upload
Content-Type: multipart/form-data
Authorization: session cookie (auth obligatoire)
```

### Paramètres (form-data)

| Champ  | Type   | Requis | Description          |
| ------ | ------ | ------ | -------------------- |
| `file` | File   | Oui    | image à uploader     |
| `type` | string | Oui    | `avatar`, `logo` ou `site` |

### Mapping type → dossier

| Type     | Dossier cible                    |
| -------- | -------------------------------- |
| `avatar` | `public/uploads/images/avatars/` |
| `logo`   | `public/uploads/images/logos/`   |
| `site`   | `public/uploads/images/site/`    |

### Réponse succès (201)

```json
{ "url": "/uploads/images/avatars/a1b2c3d4-5678-90ab-cdef.jpg" }
```

### Réponses erreur

| Status | Code | Description |
| ------ | ---- | ----------- |
| 401 | — | Non authentifié |
| 400 | — | Body non multipart, champ `file` manquant, champ `type` invalide |
| 400 | `INVALID_TYPE` | Type MIME non autorisé |
| 400 | `FILE_TOO_LARGE` | Fichier trop volumineux (> 2 MB) |
| 500 | — | Erreur serveur inattendue |

## Validations

### Types MIME autorisés

- `image/jpeg`
- `image/png`
- `image/webp`
- `image/avif`
- `image/svg+xml`
- `image/x-icon` / `image/vnd.microsoft.icon`

> SVG et ICO sont validés par **magic bytes** (signatures binaires) en plus du Content-Type.

### Taille max

2 MB par défaut (configurable via `UploadOptions.maxSize`).

## Nommage des fichiers

Chaque fichier reçoit un nom unique : `UUID` + extension originale.
Exemple : `f47ac10b-58cc-4372-a567-0e02b2c3d479.jpg`

Aucune collision possible, aucune information personnelle dans le nom.

## Suppression

```ts
import { deleteUpload } from '@media/delete';

await deleteUpload('/uploads/images/avatars/f47ac10b.jpg');
```

Seuls les fichiers dans `/uploads/` sont acceptés. Le path traversal est bloqué.

## Utilisation côté client

```ts
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('type', 'avatar');

const res = await fetch('/api/upload', {
  method: 'POST',
  body: formData,
  credentials: 'include', // envoie les cookies de session
});

const { url, error } = await res.json();
if (error) {
  console.error(error);
} else {
  console.log('URL:', url); // /uploads/images/avatars/uuid.jpg
}
```

## Architecture

```md
src/media/
├── types.ts    # UploadType, UploadResult, UploadOptions, constantes
├── upload.ts   # processUpload() — validation + écriture disque
└── delete.ts   # deleteUpload() — suppression par URL

src/pages/api/
└── upload.ts   # Endpoint POST /api/upload

public/uploads/
├── .gitkeep
└── images/
    ├── avatars/
    ├── logos/
    └── site/     # logos, favicons, OG images du site
```

## Utilisation dans l'admin CMS

La page **Admin Site** (`/[lang]/admin/site`) utilise l'upload pour 4 champs image :

| Champ | Usage | Type upload |
| :-- | :-- | :-- |
| `logoLight` | Logo clair | `site` |
| `logoDark` | Logo sombre | `site` |
| `favicon` | Favicon | `site` |
| `ogImage` | Image Open Graph | `site` |

Chaque champ affiche un aperçu de l'image actuelle + un bouton "Changer l'image" qui déclenche un `<input type="file">` caché. L'upload est envoyé en `POST /api/upload` avec `type: 'site'`, et l'URL retournée est stockée dans un champ `<input type="hidden">` qui est soumis avec le formulaire principal.

## Fichiers impliqués

- `src/media/types.ts` — Types et constantes (ALLOWED_MIME_TYPES, UPLOAD_DIRS, DEFAULT_MAX_SIZE)
- `src/media/upload.ts` — `processUpload()`, `UploadError`
- `src/media/delete.ts` — `deleteUpload()`
- `src/pages/api/upload.ts` — API route POST, auth + validation + upload
