import { basename, extname } from 'node:path';
import { Effect } from 'effect';
import { Storage } from '@/lib/storage';
import { makeLocalStorage } from '@/lib/storage/local';
import { runApp } from '@/lib/effect/http';

/**
 * Supprime un média (original + variantes WebP `<stem>-<largeur>.webp`) à
 * partir de son URL publique, via le service `Storage` (brique e).
 *
 * Accepte les URL locales `/uploads/...` (toujours, y compris après bascule
 * vers S3 : anciens fichiers) et les URL publiques du driver actif.
 * Ex : deleteUpload('/uploads/images/avatars/abc-123.jpg')
 */
export async function deleteUpload(url: string): Promise<void> {
  if (!url.startsWith('/uploads/') && !/^https:\/\//.test(url)) {
    throw new Error('URL invalide — seuls les fichiers dans /uploads/ ou le stockage configuré peuvent être supprimés');
  }
  // Refuser les séparateurs Windows, `..`, octets nuls et encodages de traversée avant tout.
  if (url.includes('\\') || url.split('/').includes('..') || url.includes('\0') || /%2e|%2f|%5c|%25/i.test(url)) {
    throw new Error('Chemin invalide — tentative de path traversal détectée');
  }
  await runApp(
    deleteMediaByUrl(url).pipe(
      Effect.mapError((e) =>
        e._tag === 'UnknownMediaUrl'
          ? new Error('URL invalide — seuls les fichiers dans /uploads/ ou le stockage configuré peuvent être supprimés')
          : e._tag === 'InvalidStorageKeyError'
            ? new Error('Chemin invalide — tentative de path traversal détectée')
            : new Error(e.message),
      ),
    ),
  );
}

class UnknownMediaUrl {
  readonly _tag = 'UnknownMediaUrl';
  constructor(readonly url: string) {}
  get message() {
    return `Unknown media URL ${this.url}`;
  }
}

const legacyLocal = makeLocalStorage();

/** Effect : supprime l'objet et ses variantes. */
export const deleteMediaByUrl = (url: string) =>
  Effect.gen(function* () {
    const active = yield* Storage;
    let storage = active;
    let key = active.keyFromUrl(url);
    if (key === null && active.driver !== 'local') {
      key = legacyLocal.keyFromUrl(url);
      storage = legacyLocal;
    }
    if (key === null) return yield* Effect.fail(new UnknownMediaUrl(url));
    yield* storage.remove(key);
    // Variantes : même dossier, préfixe exact `<stem>-` (pour ne pas toucher `photo-grand.webp`
    // en supprimant `photo.jpg`, on filtre sur `<stem>-<chiffres>.webp`).
    const dir = key.slice(0, key.lastIndexOf('/') + 1);
    const stem = basename(key, extname(key));
    const variantRe = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\.webp$`);
    const siblings = yield* storage.list(`${dir}${stem}-`).pipe(Effect.orElseSucceed(() => []));
    yield* Effect.forEach(
      siblings.filter((o) => variantRe.test(o.key.slice(dir.length))),
      (o) => storage.remove(o.key).pipe(Effect.ignore),
      { concurrency: 4 },
    );
  }).pipe(Effect.withSpan('media.delete'));
