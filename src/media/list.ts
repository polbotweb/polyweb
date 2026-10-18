import { extname } from 'node:path';
import { Effect } from 'effect';
import { Storage } from '@/lib/storage';
import { runApp } from '@/lib/effect/http';
import type { UploadType } from './types';
import { UPLOAD_DIRS } from './types';

export interface MediaFile {
  name: string;
  url: string;
  type: UploadType;
  size: number;
  ext: string;
  modifiedAt: string;
}

/** Variante responsive générée à l'upload (`<stem>-<largeur>.webp`). */
const VARIANT_RE = /-\d+\.webp$/;

/**
 * Effect : liste les médias d'un type (ou de tous) via le service `Storage`
 * (brique e), variantes exclues, plus récents d'abord.
 */
export const listMedia = (type?: UploadType) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const types = type ? [type] : (Object.keys(UPLOAD_DIRS) as UploadType[]);
    const perType = yield* Effect.forEach(types, (t) =>
      storage.list(`${UPLOAD_DIRS[t]}/`).pipe(
        Effect.map((objects) =>
          objects
            // Fichiers directement dans le dossier du type (pas les sous-dossiers d'un autre type).
            .filter((o) => !o.key.slice(UPLOAD_DIRS[t].length + 1).includes('/'))
            .filter((o) => !VARIANT_RE.test(o.key))
            .map((o): MediaFile => {
              const name = o.key.slice(o.key.lastIndexOf('/') + 1);
              return { name, url: storage.publicUrl(o.key), type: t, size: o.size, ext: extname(name).toLowerCase(), modifiedAt: o.lastModified.toISOString() };
            }),
        ),
      ),
    );
    return perType.flat().sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  });

/** Façade Promise (appelants non migrés). */
export async function listUploads(type?: UploadType): Promise<MediaFile[]> {
  return runApp(listMedia(type));
}
