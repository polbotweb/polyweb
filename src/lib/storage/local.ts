/** Driver local : fichiers sous `public/uploads/`, URL `/uploads/<clé>`. */
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Effect } from 'effect';
import { StorageError, validateKey, type StorageShape, type StoredObject } from './storage';

export function makeLocalStorage(root = resolve(process.cwd(), 'public', 'uploads'), urlBase = '/uploads'): StorageShape {
  const pathFor = (key: string) => {
    const p = resolve(root, key);
    if (p !== root && !p.startsWith(root + sep)) throw new Error('path escapes storage root');
    return p;
  };
  const attempt = <A>(operation: string, key: string, f: () => Promise<A>) =>
    Effect.tryPromise({ try: f, catch: (cause) => new StorageError({ operation, key, cause }) });

  const walk = async (dir: string): Promise<StoredObject[]> => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    const out: StoredObject[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(full)));
      else if (entry.isFile()) {
        const s = await stat(full);
        out.push({ key: relative(root, full).split(sep).join('/'), size: s.size, lastModified: s.mtime });
      }
    }
    return out;
  };

  return {
    driver: 'local',
    put: (key, body, _options) =>
      Effect.flatMap(validateKey(key), () =>
        attempt('put', key, async () => {
          const p = pathFor(key);
          await mkdir(dirname(p), { recursive: true, mode: 0o755 });
          await writeFile(p, body, { mode: 0o644 });
          return { key, url: `${urlBase}/${key}` };
        }),
      ),
    get: (key) => Effect.flatMap(validateKey(key), () => attempt('get', key, () => readFile(pathFor(key)))),
    remove: (key) => Effect.flatMap(validateKey(key), () => attempt('remove', key, () => rm(pathFor(key), { force: true }))),
    list: (prefix) =>
      Effect.flatMap(validateKey(prefix, { allowEmpty: true, allowTrailingSlash: true }), () =>
        attempt('list', prefix, async () => {
          // Le préfixe peut s'arrêter au milieu d'un nom de fichier (`media/abc-`).
          const dirPart = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : '';
          const all = await walk(dirPart ? pathFor(dirPart) : root);
          return all.filter((o) => o.key.startsWith(prefix));
        }),
      ),
    publicUrl: (key) => `${urlBase}/${key}`,
    keyFromUrl: (url) => (url.startsWith(`${urlBase}/`) ? url.slice(urlBase.length + 1) : null),
  };
}
