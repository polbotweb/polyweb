import { eq, asc, isNull, and, desc, inArray, count, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { cached } from "@database/cache";
import { mediaFolders, mediaFiles, mediaFileAlts } from "@database/schemas";
import type { DbError } from "@/lib/effect/errors";
import { dbTry, runOrThrow } from "@/lib/effect/run";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MediaFolderNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: MediaFolderNode[];
}

export interface MediaFileWithAlts {
  id: string;
  folderId: string | null;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
  alts: { locale: string; alt: string; title: string | null }[];
}

// ─── Folders ─────────────────────────────────────────────────────────────────

function mediaFolderScope(organizationId: string | null) {
  return organizationId === null
    ? isNull(mediaFolders.organizationId)
    : eq(mediaFolders.organizationId, organizationId);
}

function mediaFileScope(organizationId: string | null) {
  return organizationId === null
    ? isNull(mediaFiles.organizationId)
    : eq(mediaFiles.organizationId, organizationId);
}

/** Max nesting depth for folder tree to prevent stack overflow with corrupt data. */
const MAX_FOLDER_DEPTH = 20;

/** Build a hierarchical tree from a flat folder list. */
function buildFolderTree(
  rows: (typeof mediaFolders.$inferSelect)[],
): MediaFolderNode[] {
  const map = new Map<string, MediaFolderNode>();
  const roots: MediaFolderNode[] = [];

  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      sortOrder: row.sortOrder,
      children: [],
    });
  }

  // Detect depth and prevent circular references
  const getDepth = (nodeId: string, visited = new Set<string>()): number => {
    const node = map.get(nodeId);
    if (!node?.parentId || visited.has(nodeId)) return 0;
    visited.add(nodeId);
    return 1 + getDepth(node.parentId, visited);
  };

  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId) && getDepth(node.id) <= MAX_FOLDER_DEPTH) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/*
 * Médiathèque Effect-native (`dbTry` : DbError typé, span `db.media.<op>`). Les exports Promise
 * restent des adaptateurs `runOrThrow`, `cached(...)` avec les mêmes clés quand ils l'étaient.
 */
type MediaFileRow = typeof mediaFiles.$inferSelect;

/** Joint les textes alternatifs (une requête groupée) aux fichiers, dans l'ordre reçu. */
const withAlts = (files: MediaFileRow[]): Effect.Effect<MediaFileWithAlts[], DbError> =>
  files.length === 0
    ? Effect.succeed([])
    : dbTry("media.alts", () => getDrizzle().select().from(mediaFileAlts).where(inArray(mediaFileAlts.fileId, files.map((f) => f.id)))).pipe(
        Effect.map((alts) => {
          const altsMap = new Map<string, { locale: string; alt: string; title: string | null }[]>();
          for (const a of alts) {
            if (!altsMap.has(a.fileId)) altsMap.set(a.fileId, []);
            altsMap.get(a.fileId)!.push({ locale: a.locale, alt: a.alt, title: a.title });
          }
          return files.map((f) => ({
            id: f.id,
            folderId: f.folderId,
            filename: f.filename,
            url: f.url,
            mimeType: f.mimeType,
            size: f.size,
            width: f.width,
            height: f.height,
            createdAt: f.createdAt,
            alts: altsMap.get(f.id) ?? [],
          }));
        }),
      );

const mediaFoldersEffect = (organizationId: string | null = null): Effect.Effect<MediaFolderNode[], DbError> =>
  dbTry("media.folders", () =>
    getDrizzle().select().from(mediaFolders).where(mediaFolderScope(organizationId)).orderBy(asc(mediaFolders.sortOrder), asc(mediaFolders.name)),
  ).pipe(Effect.map(buildFolderTree));

const mediaFoldersListEffect = (organizationId: string | null = null) =>
  dbTry("media.foldersList", () =>
    getDrizzle()
      .select({ id: mediaFolders.id, name: mediaFolders.name, parentId: mediaFolders.parentId })
      .from(mediaFolders)
      .where(mediaFolderScope(organizationId))
      .orderBy(asc(mediaFolders.name)),
  );

const mediaFilesByFolderEffect = (folderId: string | null, organizationId: string | null = null) =>
  dbTry("media.filesByFolder", () =>
    getDrizzle()
      .select()
      .from(mediaFiles)
      .where(folderId ? and(eq(mediaFiles.folderId, folderId), mediaFileScope(organizationId)) : and(isNull(mediaFiles.folderId), mediaFileScope(organizationId)))
      .orderBy(desc(mediaFiles.createdAt)),
  ).pipe(Effect.flatMap(withAlts));

const mediaFileEffect = (fileId: string, organizationId: string | null = null): Effect.Effect<MediaFileWithAlts | null, DbError> =>
  Effect.gen(function* () {
    const [file] = yield* dbTry("media.file", () =>
      getDrizzle().select().from(mediaFiles).where(and(eq(mediaFiles.id, fileId), mediaFileScope(organizationId))).limit(1),
    );
    if (!file) return null;
    const alts = yield* dbTry("media.fileAlts", () => getDrizzle().select().from(mediaFileAlts).where(eq(mediaFileAlts.fileId, fileId)));
    return {
      id: file.id,
      folderId: file.folderId,
      filename: file.filename,
      url: file.url,
      mimeType: file.mimeType,
      size: file.size,
      width: file.width,
      height: file.height,
      createdAt: file.createdAt,
      alts: alts.map((a) => ({ locale: a.locale, alt: a.alt, title: a.title })),
    };
  });

const allMediaFilesEffect = (organizationId: string | null = null) =>
  dbTry("media.allFiles", () =>
    getDrizzle().select().from(mediaFiles).where(mediaFileScope(organizationId)).orderBy(desc(mediaFiles.createdAt)).limit(5000),
  ).pipe(Effect.flatMap(withAlts));

const mediaFileCountsByFolderEffect = (organizationId: string | null = null): Effect.Effect<Map<string | null, number>, DbError> =>
  dbTry("media.countsByFolder", () =>
    getDrizzle().select({ folderId: mediaFiles.folderId, count: count() }).from(mediaFiles).where(mediaFileScope(organizationId)).groupBy(mediaFiles.folderId),
  ).pipe(Effect.map((rows) => new Map(rows.map((r) => [r.folderId, r.count] as [string | null, number]))));

const mediaStatsEffect = (organizationId: string | null = null) =>
  Effect.all(
    [
      dbTry("media.fileStats", () =>
        getDrizzle()
          .select({ totalFiles: count(), totalSize: sql<number>`coalesce(sum(${mediaFiles.size}), 0)` })
          .from(mediaFiles)
          .where(mediaFileScope(organizationId)),
      ),
      dbTry("media.folderStats", () => getDrizzle().select({ totalFolders: count() }).from(mediaFolders).where(mediaFolderScope(organizationId))),
    ],
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map(([[fileStats], [folderStats]]) => ({
      totalFiles: fileStats.totalFiles,
      totalSize: Number(fileStats.totalSize),
      totalFolders: folderStats.totalFolders,
    })),
  );

/** Lectures Effect-natives NON mises en cache (`effect.ts` garde les versions `cached`). */
export const mediaLoaderEffects = {
  getMediaFolders: mediaFoldersEffect,
  getMediaFoldersList: mediaFoldersListEffect,
  getMediaFilesByFolder: mediaFilesByFolderEffect,
  getMediaFile: mediaFileEffect,
  getAllMediaFiles: allMediaFilesEffect,
  getMediaFileCountsByFolder: mediaFileCountsByFolderEffect,
  getMediaStats: mediaStatsEffect,
};

// ─── Adaptateurs Promise (API historique) ───────────────────────────────────

export const getMediaFolders = cached(
  (organizationId: string | null = null) => `media:folders:${organizationId ?? "global"}`,
  (organizationId: string | null = null): Promise<MediaFolderNode[]> => runOrThrow(mediaFoldersEffect(organizationId)),
);

/** Flat list of all folders (for dropdown selectors). */
export const getMediaFoldersList = cached(
  (organizationId: string | null = null) => `media:folders:list:${organizationId ?? "global"}`,
  (organizationId: string | null = null) => runOrThrow(mediaFoldersListEffect(organizationId)),
);

/** List files in a given folder (null = root). Includes all alt texts. */
export const getMediaFilesByFolder = cached(
  (folderId: string | null, organizationId: string | null = null) => `media:files:folder:${organizationId ?? "global"}:${folderId ?? "root"}`,
  (folderId: string | null, organizationId: string | null = null): Promise<MediaFileWithAlts[]> =>
    runOrThrow(mediaFilesByFolderEffect(folderId, organizationId)),
);

/** Get a single file with its alt texts. Not cached (for admin detail views). */
export const getMediaFile = (fileId: string, organizationId: string | null = null): Promise<MediaFileWithAlts | null> =>
  runOrThrow(mediaFileEffect(fileId, organizationId));

/** Get all media files (for media picker). Includes alts. */
export const getAllMediaFiles = cached(
  (organizationId: string | null = null) => `media:files:all:${organizationId ?? "global"}`,
  (organizationId: string | null = null): Promise<MediaFileWithAlts[]> => runOrThrow(allMediaFilesEffect(organizationId)),
);

/** File count per folderId (null key = root). */
export const getMediaFileCountsByFolder = cached(
  (organizationId: string | null = null) => `media:counts:${organizationId ?? "global"}`,
  (organizationId: string | null = null): Promise<Map<string | null, number>> => runOrThrow(mediaFileCountsByFolderEffect(organizationId)),
);

/** Global media stats for the library header. */
export const getMediaStats = cached(
  (organizationId: string | null = null) => `media:stats:${organizationId ?? "global"}`,
  (organizationId: string | null = null): Promise<{ totalFiles: number; totalSize: number; totalFolders: number }> =>
    runOrThrow(mediaStatsEffect(organizationId)),
);
