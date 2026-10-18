import { basename, dirname, extname, join } from 'node:path';
import sharp from 'sharp';

/**
 * Génération de variantes responsive pour les médias uploadés.
 *
 * ─── Pourquoi ce module existe ───────────────────────────────────────────
 *
 * `astro:assets` ne peut PAS optimiser ces images : nos médias vivent dans
 * `public/uploads/` et sont donc servis tels quels (« Images in your public/
 * folder are never optimized »). Passer une simple chaîne à `<Image>` la
 * classe en `RemoteImageProps`, qui n'optimise rien non plus et exige
 * `width`/`height`.
 *
 * Concrètement : une photo de voyage de 4737×3440 px en JPEG (3 Mo) partait
 * telle quelle, en LCP, sur chaque carte de blog — Lighthouse mesurait
 * 5,7 Mo par page et un LCP à 4,6 s.
 *
 * On produit donc nous-mêmes les variantes, à l'upload, avec sharp :
 *
 *   <picture>
 *     <source type="image/webp" srcset="…-320.webp 320w, …-960.webp 960w">
 *     <img src="original.jpg" …>   ← repli universellement supporté
 *   </picture>
 *
 * Le navigateur choisit le bon fichier ; le repli reste l'original, donc
 * zéro régression sur les navigateurs sans `<picture>` ni WebP (Safari ancien).
 *
 * ─── Pourquoi ce n'est PAS un service d'images à la demande ──────────────
 *
 * Une transformation à la volée (endpoint `/_image`) est élégante mais ici
 * elle coûterait un sharp() par image et par cache manquant, sur le chemin
 * critique du rendu. Les variantes sont figées au moment de l'upload : le coût
 * est payé une fois, à l'écriture, et le serveur ne fait que servir du
 * statique. C'est le compromis adapté à un CMS auto-hébergé.
 */

/** Largeurs générées pour le `srcset` (en px CSS). */
export const RESPONSIVE_WIDTHS = [320, 640, 960, 1280, 1920] as const;

/** Qualité WebP : 75 est le sweet spot qualité/poids pour la photo web. */
const WEBP_QUALITY = 75;

/** Tailles d'upload non rasterisées (vectoriel, icônes) — pas de variantes. */
const RASTER_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/** Largeur maximale d'une variante. Au-delà, l'original reste le bon choix. */
const MAX_VARIANT_WIDTH = 1920;

/**
 * Plafond de pixels d'une image acceptée (largeur × hauteur).
 *
 * 40 Mpx : très au-dessus d'un capteur reflex/phone courant (12–50 Mpx), mais
 * borné. Le risque est réel malgré la limite de 2 Mo : un JPEG « tout blanc »
 * se compresse à quelques centaines de kilo-octets pour 50 000×50 000, et son
 * décodage alloue alors ~7,5 Go en RGB. C'est une bombe de pixels, denial of
 * service triviale à envoyer via un formulaire d'upload.
 */
export const MAX_IMAGE_PIXELS = 40_000_000;

/** Dimensions d'une image validée. */
export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Force un décodage complet et renvoie les dimensions vérifiées.
 *
 * Lève si l'image est illisible ou dépasse `MAX_IMAGE_PIXELS`. À appeler
 * AVANT toute écriture sur le disque.
 *
 * `limitInputPixels` est passé à sharp pour qu'il refuse la bombe de pixels
 * dès l'analyse de l'en-tête, sans jamais allouer le tampon correspondingly.
 * Le décodage `.raw()` (et non un simple `metadata()`, qui ne lit que
 * l'en-tête) est ce qui détecte un fichier tronqué au milieu des pixels.
 */
export async function decodeAndValidate(
  buffer: Buffer,
  mimeType: string,
): Promise<ImageDimensions> {
  // Les formats non rasterisables (SVG…) sont déjà validés par sanitisation
  // DOMPurify : il n'y a pas de dimensions intrinsèques à vérifier.
  if (!RASTER_MIME_TYPES.has(mimeType)) {
    return { width: 0, height: 0 };
  }

  const image = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' });

  // sharp rejette lui-même certaines images avant même que l'on puisse les
  // inspecter (en-tête illisible, plafond de pixels franchi). Sans ce mapping,
  // ces erreurs sortent brutes : l'appelant ne peut plus distinguer « fichier
  // corrompu » d'« image trop grande », et le détail technique de libvips
  // fuit jusqu'au client.
  try {
    const { width, height } = await image.metadata();

    if (!width || !height) {
      throw new UndecodableImageError(
        "L'image est illisible : ses dimensions sont introuvables. Le fichier est probablement tronqué ou corrompu.",
      );
    }

    if (width * height > MAX_IMAGE_PIXELS) {
      throw new ImageTooLargeError(
        `Image trop grande : ${width}×${height} px dépasse la limite de ${Math.floor(MAX_IMAGE_PIXELS / 1_000_000)} Mpx.`,
      );
    }

    // Décodage réel des pixels : c'est ici qu'un fichier tronqué se révèle.
    // `raw()` sans format de sortie évite toute ré-encodage.
    await image.raw().toBuffer();

    return { width, height };
  } catch (err) {
    // Les erreurs déjà typées sont propagées telles quelles.
    if (err instanceof UndecodableImageError || err instanceof ImageTooLargeError) throw err;

    const message = err instanceof Error ? err.message : String(err);
    if (/pixel limit|exceeds pixel/i.test(message)) {
      throw new ImageTooLargeError(
        `Image trop grande : elle dépasse la limite de ${Math.floor(MAX_IMAGE_PIXELS / 1_000_000)} Mpx.`,
      );
    }
    throw new UndecodableImageError(
      "L'image n'a pas pu être décodée. Le fichier est probablement corrompu, tronqué ou d'un format non pris en charge.",
    );
  }
}

/** Image dont les pixels ne peuvent pas être décodés (tronquée, corrompue). */
export class UndecodableImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UndecodableImageError';
  }
}

/** Image refusée pour dépassement du plafond de pixels. */
export class ImageTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageTooLargeError';
  }
}

/**
 * Rend un fragment de nom de fichier sûr dans une URL et dans un `srcset`.
 *
 * Indispensable : les médias de démonstration ont des noms humainisés
 * (« Kravica Waterfalls.jpg »). Un espace dans un `srcset` est le SÉPARATEUR
 * de descripteurs — `…-320.webp 320w` serait donc découpé au milieu de l'URL
 * et le navigateur adopterait une source inexistante. On ne leallow donc
 * jamais en sortie.
 */
function safeStem(url: string): string {
  const stem = basename(url, extname(url));
  const safe = stem
    .normalize('NFKD')
    // Retire les diacritiques pour rester lisible et stable sur tous les
    // systèmes de fichiers (Windows est insensible à la casse, Linux non).
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  // Repli si le nom ne contenait que des caractères exotiques.
  return safe || 'image';
}

/** Une variante servable par le navigateur. */
export interface ImageVariant {
  /** Largeur en px. */
  width: number;
  /** Hauteur en px (ratio préservé). */
  height: number;
  /** MIME du fichier variante. */
  mimeType: string;
  /** URL publique (ex. `/uploads/media/x-640.webp`). */
  url: string;
  /** Poids en octets. */
  size: number;
}

/**
 * Forme stockée en base (colonne JSONB `media_files.variants`).
 *
 * Volontairement plus étroite qu'`ImageVariant` : `mimeType` et `size` ne sont
 * utiles qu'à l'écriture (journalisation du backfill), pas au rendu. Ne pas
 * les garder évite un second aller-retour base de données pour reconstruire un
 * `srcset`, qui n'a besoin que de la largeur et de l'URL.
 */
export interface StoredImageVariant {
  width: number;
  height: number;
  url: string;
}

/** Entrée du générateur : le fichier déjà validé et bufferisé. */
export interface VariantInput {
  /** Contenu binaire de l'image d'origine. */
  buffer: Buffer;
  /** MIME de l'original. */
  mimeType: string;
  /** URL publique de l'original (ex. `/uploads/media/x.jpg`). */
  url: string;
  /** Dossier absolu de destination. */
  dir: string;
  /**
   * Dimensions déjà validées par `decodeAndValidate`. Évite de ré-analyser
   * l'en-tête ; le upload les fournit systématiquement.
   */
  sourceWidth?: number;
  sourceHeight?: number;
}

/**
 * Produit les variantes WebP redimensionnées d'une image.
 *
 * Ne redimensionne JAMAIS vers le haut : une image de 400 px ne gagne rien à
 * être étirée en 640, et l'agrandissement coûte des octets pour zéro gain.
 * Les largeurs au-delà de la largeur source sont donc ignorées.
 *
 * Ne lève pas : un échec de variante ne doit jamais faire échouer un upload
 * (l'original reste servable). Les erreurs sont journalisées et un tableau
 * vide est renvoyé — l'appelant retombe alors sur l'original.
 */
export async function generateResponsiveVariants(input: VariantInput): Promise<ImageVariant[]> {
  const { buffer, mimeType, url, dir } = input;

  if (!RASTER_MIME_TYPES.has(mimeType)) return [];

  try {
    // Une seule instance sharp, clonée par largeur : sans `clone()`, chaque
    // appel re-parserait l'en-tête et rouvrirait le décodeur. Sur 5 variantes
    // d'une photo 3 Mo, c'est 5× le travail pour rien.
    const base = sharp(buffer, { failOn: 'none' });
    const sourceWidth = input.sourceWidth ?? (await base.metadata()).width;
    const sourceHeight = input.sourceHeight ?? (await base.metadata()).height;
    if (!sourceWidth || !sourceHeight) return [];

    const stem = safeStem(url);
    const cap = Math.min(sourceWidth, MAX_VARIANT_WIDTH);
    const targets: number[] = [
      ...RESPONSIVE_WIDTHS.filter((width) => width < cap),
      // Le dernier palier arrimé à la source évite de servir un 1920w quand
      // l'original fait 800 px (étirement inutile), et de servir un original de
      // 4737 px en WebP (2,8 Mo pour 88 % du poids de l'original, alors que
      // personne ne l'affiche à cette taille).
      cap,
    ]
      .filter((width) => width > 0)
      .filter((width, index, all) => all.indexOf(width) === index)
      .sort((a, b) => a - b);

    const variants: ImageVariant[] = [];

    for (const width of targets) {
      const filename = `${stem}-${width}.webp`;
      const info = await base
        .clone()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(join(dir, filename));

      // On dérive l'URL de l'URL d'origine en ne remplaçant que le nom de
      // fichier : le dossier (`/uploads/media/trips/bosnia/`) est conservé tel
      // quel, donc jamais ré-encodé ni réinterprété.
      const publicDir = url.slice(0, url.lastIndexOf('/') + 1);
      variants.push({
        width: info.width,
        height: info.height,
        mimeType: 'image/webp',
        url: `${publicDir}${filename}`,
        size: info.size,
      });
    }

    return variants;
  } catch (err) {
    // libvips remonte des diagnostics multilignes très verbeux
    // (« Input buffer has corrupt header » suivi de 4 lignes VipsJpeg…).
    // On ne garde que la première ligne : le contexte utile y est, et le
    // journal reste lisible quand un媒体 est réellement corrompu.
    const reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
    console.warn(`[variants] No responsive variant for ${url} (${reason}). Serving the original.`);
    return [];
  }
}

/**
 * Sérialise les variantes pour la colonne JSONB `media_files.variants`.
 *
 * Tolérante à `null`/`undefined` : c'est la frontière vers la base, et un
 * upload sans variante (vecteur, Sharp indisponible, ou chemin d'appel qui
 * fournit un `UploadResult` minimal) doit se traduire par « aucune variante »
 * — donc servir l'original — jamais par un rejet d'upload.
 */
export function serializeVariants(variants?: ImageVariant[] | null): StoredImageVariant[] {
  if (!Array.isArray(variants)) return [];
  return variants.map(({ width, height, url }) => ({ width, height, url }));
}

/** Reconstruit un `srcset` HTML à partir des variantes stockées. */
export function buildSrcSet(variants: StoredImageVariant[]): string {
  return [...variants]
    .sort((a, b) => a.width - b.width)
    .map(({ width, url }) => `${url} ${width}w`)
    .join(', ');
}

/** Chemin disque absolu d'une URL publique `/uploads/...`. */
export function uploadsPathFor(publicUrl: string): string {
  return join(process.cwd(), dirname(publicUrl.replace(/^\/+/, '')));
}
