// ─── Media Upload Types ──────────────────────────────────────────────

/** Types d'upload supportés — chaque type mappe vers un sous-dossier */
export type UploadType = 'avatar' | 'logo' | 'site' | 'media';

/** Mapping type → sous-dossier dans public/uploads/ */
export const UPLOAD_DIRS: Record<UploadType, string> = {
  avatar: 'images/avatars',
  logo: 'images/logos',
  site: 'images/site',
  media: 'images/media',
};

/** Types MIME autorisés */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/x-icon',
  'image/svg+xml',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Taille max par défaut en octets (2 MB) */
export const DEFAULT_MAX_SIZE = 2 * 1024 * 1024;

/** Options de traitement d'upload */
export interface UploadOptions {
  /** Sous-dossier cible dans public/uploads/ */
  subDir: string;
  /** Taille max en octets (défaut : 2 MB) */
  maxSize?: number;
  /** Types MIME autorisés (défaut : ALLOWED_MIME_TYPES) */
  allowedTypes?: readonly string[];
}

/** Résultat d'un upload réussi */
export interface UploadResult {
  /** Nom du fichier généré (UUID + extension) */
  filename: string;
  /** Chemin absolu sur le disque */
  path: string;
  /** URL publique accessible depuis le navigateur */
  url: string;
}
