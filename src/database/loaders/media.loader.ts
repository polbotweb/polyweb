import { eq, asc, isNull, and, desc, inArray, count, sql } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { cached } from "@database/cache";
import { mediaFolders, mediaFiles, mediaFileAlts } from "@database/schemas";

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

export const getMediaFolders = cached(
  (organizationId: string | null = null) => `media:folders:${organizationId ?? "global"}`,
  async (organizationId: string | null = null): Promise<MediaFolderNode[]> => {
    const db = getDrizzle();
    const rows = await db
      .select()
      .from(mediaFolders)
      .where(mediaFolderScope(organizationId))
      .orderBy(asc(mediaFolders.sortOrder), asc(mediaFolders.name));

    return buildFolderTree(rows);
  },
);

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

/** Flat list of all folders (for dropdown selectors). */
export const getMediaFoldersList = cached(
  (organizationId: string | null = null) => `media:folders:list:${organizationId ?? "global"}`,
  async (organizationId: string | null = null) => {
    const db = getDrizzle();
    return db
      .select({
        id: mediaFolders.id,
        name: mediaFolders.name,
        parentId: mediaFolders.parentId,
      })
      .from(mediaFolders)
      .where(mediaFolderScope(organizationId))
      .orderBy(asc(mediaFolders.name));
  },
);

// ─── Files ───────────────────────────────────────────────────────────────────

/** List files in a given folder (null = root). Includes all alt texts. */
export const getMediaFilesByFolder = cached(
  (folderId: string | null, organizationId: string | null = null) => `media:files:folder:${organizationId ?? "global"}:${folderId ?? "root"}`,
  async (folderId: string | null, organizationId: string | null = null): Promise<MediaFileWithAlts[]> => {
    const db = getDrizzle();

    const whereClause = folderId
      ? and(eq(mediaFiles.folderId, folderId), mediaFileScope(organizationId))
      : and(isNull(mediaFiles.folderId), mediaFileScope(organizationId));

    const files = await db
      .select()
      .from(mediaFiles)
      .where(whereClause)
      .orderBy(desc(mediaFiles.createdAt));

    if (files.length === 0) return [];

    const fileIds = files.map((f) => f.id);
    const allAlts = await db
      .select()
      .from(mediaFileAlts)
      .where(inArray(mediaFileAlts.fileId, fileIds));

    // Build alt map
    const altsMap = new Map<string, { locale: string; alt: string; title: string | null }[]>();
    for (const a of allAlts) {
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
  },
);

/** Get a single file with its alt texts. Not cached (for admin detail views). */
export async function getMediaFile(fileId: string, organizationId: string | null = null): Promise<MediaFileWithAlts | null> {
  const db = getDrizzle();

  const [file] = await db
    .select()
    .from(mediaFiles)
    .where(and(eq(mediaFiles.id, fileId), mediaFileScope(organizationId)))
    .limit(1);

  if (!file) return null;

  const alts = await db
    .select()
    .from(mediaFileAlts)
    .where(eq(mediaFileAlts.fileId, fileId));

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
}

/** Get all media files (for media picker). Includes alts. */
export const getAllMediaFiles = cached(
  (organizationId: string | null = null) => `media:files:all:${organizationId ?? "global"}`,
  async (organizationId: string | null = null): Promise<MediaFileWithAlts[]> => {
    const db = getDrizzle();

    const files = await db
      .select()
      .from(mediaFiles)
      .where(mediaFileScope(organizationId))
      .orderBy(desc(mediaFiles.createdAt))
      .limit(5000);

    if (files.length === 0) return [];

    const fileIds = files.map((f) => f.id);
    const alts = await db
      .select()
      .from(mediaFileAlts)
      .where(inArray(mediaFileAlts.fileId, fileIds));

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
  },
);

// ─── Stats ───────────────────────────────────────────────────────────────────

/** File count per folderId (null key = root). */
export const getMediaFileCountsByFolder = cached(
  (organizationId: string | null = null) => `media:counts:${organizationId ?? "global"}`,
  async (organizationId: string | null = null): Promise<Map<string | null, number>> => {
    const db = getDrizzle();
    const rows = await db
      .select({
        folderId: mediaFiles.folderId,
        count: count(),
      })
      .from(mediaFiles)
      .where(mediaFileScope(organizationId))
      .groupBy(mediaFiles.folderId);

    const map = new Map<string | null, number>();
    for (const r of rows) {
      map.set(r.folderId, r.count);
    }
    return map;
  },
);

/** Global media stats for the library header. */
export const getMediaStats = cached(
  (organizationId: string | null = null) => `media:stats:${organizationId ?? "global"}`,
  async (organizationId: string | null = null): Promise<{ totalFiles: number; totalSize: number; totalFolders: number }> => {
    const db = getDrizzle();
    const [fileStats] = await db
      .select({
        totalFiles: count(),
        totalSize: sql<number>`coalesce(sum(${mediaFiles.size}), 0)`,
      })
      .from(mediaFiles)
      .where(mediaFileScope(organizationId));
    const [folderStats] = await db
      .select({ totalFolders: count() })
      .from(mediaFolders)
      .where(mediaFolderScope(organizationId));
    return {
      totalFiles: fileStats.totalFiles,
      totalSize: Number(fileStats.totalSize),
      totalFolders: folderStats.totalFolders,
    };
  },
);
