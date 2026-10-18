import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { listMedia } from '@/media/list';
import { Storage, type StorageShape, type StoredObject } from '@/lib/storage';

function fakeStorage(objects: StoredObject[]): StorageShape {
  return {
    driver: 's3',
    put: () => Effect.die('unused'),
    get: () => Effect.die('unused'),
    remove: () => Effect.void,
    list: (prefix) => Effect.succeed(objects.filter((o) => o.key.startsWith(prefix))),
    publicUrl: (key) => `https://cdn.test/${key}`,
    keyFromUrl: () => null,
  };
}

const run = (objects: StoredObject[], type?: Parameters<typeof listMedia>[0]) =>
  Effect.runPromise(listMedia(type).pipe(Effect.provideService(Storage, fakeStorage(objects))));

const obj = (key: string, size = 10, date = '2026-01-01T00:00:00Z'): StoredObject => ({ key, size, lastModified: new Date(date) });

describe('listMedia (Storage-backed)', () => {
  it('returns an empty array when nothing is stored', async () => {
    expect(await run([])).toEqual([]);
  });

  it('lists files for a specific type with driver URLs, excluding responsive variants', async () => {
    const files = await run([obj('images/avatars/a.jpg', 1234), obj('images/avatars/a-320.webp'), obj('images/avatars/b.webp', 5), obj('images/logos/l.png')], 'avatar');
    expect(files.map((f) => f.name).sort()).toEqual(['a.jpg', 'b.webp']);
    expect(files.find((f) => f.name === 'a.jpg')).toMatchObject({ url: 'https://cdn.test/images/avatars/a.jpg', type: 'avatar', size: 1234, ext: '.jpg' });
  });

  it('lists all types when none is specified', async () => {
    const files = await run([obj('images/avatars/a.jpg'), obj('images/logos/l.png'), obj('images/media/m.png')]);
    expect(files.map((f) => f.type).sort()).toEqual(['avatar', 'logo', 'media']);
  });

  it('sorts by modification date, newest first', async () => {
    const files = await run([obj('images/media/old.png', 1, '2025-01-01T00:00:00Z'), obj('images/media/new.png', 1, '2026-06-01T00:00:00Z')], 'media');
    expect(files.map((f) => f.name)).toEqual(['new.png', 'old.png']);
  });
});
