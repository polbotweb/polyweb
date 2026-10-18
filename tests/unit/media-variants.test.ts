import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  RESPONSIVE_WIDTHS,
  buildSrcSet,
  decodeAndValidate,
  generateResponsiveVariants,
  ImageTooLargeError,
  serializeVariants,
  UndecodableImageError,
} from '@/media/variants';

/**
 * Ces tests verrouillent le contrat des variantes responsive.
 *
 * Le bug qu'ils gardent fermé : les médias de démonstration portent des noms
 * humanisés (« Kravica Waterfalls.jpg »). Un espace dans un `srcset` est le
 * SÉPARATEUR de descripteurs, donc une URL non assainie était découpée au
 * milieu et le navigateur adoptait une source inexistante — l'image se
 * cassait silencieusement sur tous les navigateurs qui lisent le srcset.
 */
describe('variantes responsive', () => {
  let dir: string;
  const SOURCE_WIDTH = 4737;
  const SOURCE_HEIGHT = 3440;
  let buffer: Buffer;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'polyweb-variants-'));
    // Source volontairement grande : c'est le cas réel qui pèse 3 Mo.
    buffer = await sharp({
      create: {
        width: SOURCE_WIDTH,
        height: SOURCE_HEIGHT,
        channels: 3,
        background: { r: 32, g: 96, b: 160 },
      },
    })
      .jpeg({ quality: 92 })
      .toBuffer();
  });

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function generate(url = '/uploads/media/trips/bosnia/Kravica Waterfalls.jpg') {
    return generateResponsiveVariants({ buffer, mimeType: 'image/jpeg', url, dir });
  }

  it('produit des variantes strictement plus étroites que la source', async () => {
    const variants = await generate();
    expect(variants.length).toBeGreaterThan(0);
    for (const variant of variants) {
      expect(variant.width).toBeLessThan(SOURCE_WIDTH);
      expect(variant.mimeType).toBe('image/webp');
    }
  });

  it("n'émet jamais de largeur au-delà du plafond, l'original restant le choix au-dessus", async () => {
    const variants = await generate();
    const max = Math.max(...RESPONSIVE_WIDTHS);
    expect(Math.max(...variants.map((v) => v.width))).toBe(max);
  });

  it('préserve le ratio de la source', async () => {
    const variants = await generate();
    const sourceRatio = SOURCE_WIDTH / SOURCE_HEIGHT;
    for (const variant of variants) {
      expect(variant.width / variant.height).toBeCloseTo(sourceRatio, 1);
    }
  });

  it('assainit les noms de fichier : aucune espace dans les URLs de variante', async () => {
    const variants = await generate();
    for (const variant of variants) {
      expect(variant.url).not.toMatch(/\s/);
    }
  });

  it('assainit les accents et caractères exotiques', async () => {
    const variants = await generate('/uploads/media/trips/france/Cote dAzur - Ete.jpeg');
    for (const variant of variants) {
      expect(variant.url).not.toMatch(/\s/);
      expect(variant.url).toMatch(/^[\x20-\x7E]+$/);
    }
  });

  it('écrit réellement les fichiers sur disque', async () => {
    const variants = await generate();
    for (const variant of variants) {
      const file = await stat(join(dir, variant.url.split('/').pop()!));
      expect(file.size).toBeGreaterThan(0);
      expect(file.size).toBe(variant.size);
    }
  });

  it('réduit fortement le poids servi : une carte de blog ne doit pas coûter 3 Mo', async () => {
    const variants = await generate();
    const small = variants.find((v) => v.width === 640) ?? variants[0];
    // 92 % de gain au minimum : c'est le cœur du correctif de performance.
    expect(small.size).toBeLessThan(buffer.byteLength * 0.08);
  });

  it('ignore les formats non rasterisables (SVG)', async () => {
    const variants = await generateResponsiveVariants({
      buffer,
      mimeType: 'image/svg+xml',
      url: '/uploads/media/logo.svg',
      dir,
    });
    expect(variants).toEqual([]);
  });

  it('retourne un tableau vide plutôt que de lever si le fichier est illisible', async () => {
    const variants = await generateResponsiveVariants({
      buffer: Buffer.from('octets arbitraires qui ne sont pas une image'),
      mimeType: 'image/jpeg',
      url: '/uploads/media/casse.jpg',
      dir,
    });
    expect(variants).toEqual([]);
  });

  it('construit un srcset trié, exploitable tel quel dans un attribut HTML', () => {
    const srcset = buildSrcSet([
      { width: 960, height: 700, url: '/a-960.webp' },
      { width: 320, height: 233, url: '/a-320.webp' },
      { width: 640, height: 466, url: '/a-640.webp' },
    ]);
    expect(srcset).toBe('/a-320.webp 320w, /a-640.webp 640w, /a-960.webp 960w');
  });

  it('sérialise sans les métadonnées inutilisées au rendu', () => {
    const stored = serializeVariants([
      { width: 320, height: 200, mimeType: 'image/webp', url: '/a-320.webp', size: 1234 },
    ]);
    expect(stored).toEqual([{ width: 320, height: 200, url: '/a-320.webp' }]);
  });
});

/**
 * Décodage durci : un fichier doit être réellement décodable et borné en
 * pixels AVANT d'être écrit sur le disque.
 *
 * La motivation est une attaque, pas un bug d'affichage : un JPEG « tout
 * blanc » de 50 000×50 000 se compresse à quelques centaines de kilo-octets
 * (donc passe la limite de 2 Mo) mais son décodage alloue ~7,5 Go. Le
 * serveur doit refuser ce fichier au lieu de s'écrouler sous un formulaire
 * d'upload.
 */
describe('decodeAndValidate', () => {
  it('valide une image normale et renvoie ses dimensions', async () => {
    const buffer = await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    await expect(decodeAndValidate(buffer, 'image/jpeg')).resolves.toEqual({
      width: 640,
      height: 480,
    });
  });

  it('rejette une image tronquée', async () => {
    const buffer = await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    await expect(decodeAndValidate(buffer.subarray(0, 60), 'image/jpeg')).rejects.toBeInstanceOf(
      UndecodableImageError,
    );
  });

  it('rejette une bombe de pixels (décompression vers une image gigantesque)', async () => {
    // 12 000 × 12 000 = 144 Mpx, bien au-delà du plafond de 40 Mpx, tout en
    // tenant dans un buffer minuscule (fond uni = compression quasi nulle).
    const buffer = await sharp({
      create: { width: 12_000, height: 12_000, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .jpeg({ quality: 1 })
      .toBuffer();
    expect(buffer.byteLength).toBeLessThan(2 * 1024 * 1024); // passe le plafond de taille
    await expect(decodeAndValidate(buffer, 'image/jpeg')).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it('ne signale pas de dimensions pour un format vectoriel', async () => {
    await expect(decodeAndValidate(Buffer.from('<svg/>'), 'image/svg+xml')).resolves.toEqual({
      width: 0,
      height: 0,
    });
  });
});
