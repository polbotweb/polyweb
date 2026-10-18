import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, isNull } from "drizzle-orm";
import { rename } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { getDrizzle } from "@database/drizzle";
import { mediaFolders, mediaFiles, mediaFileAlts } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { processUpload } from "@/media/upload";
import { deleteUpload } from "@/media/delete";
import { UPLOAD_DIRS } from "@/media/types";
import { assertPermission, adminRateLimit, auditAdmin } from "./_helpers";
import { LOCALES } from "@i18n/config";

const localeEnum = z.enum(LOCALES, {
  message: `La locale doit être l'une des suivantes : ${LOCALES.join(", ")}.`,
});

interface MediaTenantContext {
  organizationId: string | null;
  isOrgContext: boolean;
}

function resolveMediaTenant(input: { organizationId?: string | null }): MediaTenantContext {
  return {
    organizationId: input.organizationId ?? null,
    isOrgContext: !!input.organizationId,
  };
}

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

async function assertMediaPermission(
  context: Parameters<typeof assertPermission>[0],
  tenant: MediaTenantContext,
  permissions: Parameters<typeof assertPermission>[1],
) {
  const user = context.locals.user;
  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "Vous devez être connecté pour effectuer cette action.",
    });
  }
  if (user.banned) {
    throw new ActionError({ code: "FORBIDDEN", message: "Compte suspendu." });
  }

  if (user.role === "admin") {
    return user;
  }

  if (tenant.isOrgContext) {
    const { auth } = await import("@/lib/auth");
    const fullOrg = await auth.api.getFullOrganization({
      query: { organizationId: tenant.organizationId! },
      headers: context.request.headers,
    });

    if (!fullOrg) {
      throw new ActionError({ code: "NOT_FOUND", message: "Organisation introuvable." });
    }

    const member = (fullOrg.members ?? []).find(
      (item: { userId: string }) => item.userId === user.id,
    );

    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      throw new ActionError({
        code: "FORBIDDEN",
        message: "Vous devez être propriétaire ou administrateur de cette organisation.",
      });
    }
  }

  return assertPermission(context, permissions);
}

async function assertFolderInTenant(folderId: string, tenant: MediaTenantContext) {
  const db = getDrizzle();
  const [folder] = await db
    .select({ id: mediaFolders.id, organizationId: mediaFolders.organizationId, parentId: mediaFolders.parentId })
    .from(mediaFolders)
    .where(eq(mediaFolders.id, folderId))
    .limit(1);

  if (!folder) {
    throw new ActionError({ code: "NOT_FOUND", message: "Dossier introuvable." });
  }

  if ((folder.organizationId ?? null) !== tenant.organizationId) {
    throw new ActionError({ code: "FORBIDDEN", message: "Ce dossier n'appartient pas à ce tenant." });
  }

  return folder;
}

async function assertFileInTenant(fileId: string, tenant: MediaTenantContext) {
  const db = getDrizzle();
  const [file] = await db
    .select()
    .from(mediaFiles)
    .where(eq(mediaFiles.id, fileId))
    .limit(1);

  if (!file) {
    throw new ActionError({ code: "NOT_FOUND", message: "Fichier introuvable." });
  }

  if ((file.organizationId ?? null) !== tenant.organizationId) {
    throw new ActionError({ code: "FORBIDDEN", message: "Ce fichier n'appartient pas à ce tenant." });
  }

  return file;
}

// ═══════════════════════════════════════════════════════════════════════
// Folders
// ═══════════════════════════════════════════════════════════════════════

export const createMediaFolder = defineAction({
  input: z.object({
    name: z
      .string()
      .trim()
      .min(1, "Le nom du dossier est requis.")
      .max(200, "Le nom ne peut pas dépasser 200 caractères."),
    parentId: z.string().nullable().optional(),
    organizationId: z.uuid().optional().nullable(),
  }),
  handler: async (input, context) => {
    const tenant = resolveMediaTenant(input);
    const user = await assertMediaPermission(context, tenant, { media: ["upload"] });
    adminRateLimit(context, user.id, "media");

    const db = getDrizzle();

    // Validate parent exists if provided
    if (input.parentId) {
      await assertFolderInTenant(input.parentId, tenant);
    }

    let created;
    try {
      [created] = await db
        .insert(mediaFolders)
        .values({
          organizationId: tenant.organizationId,
          name: input.name,
          parentId: input.parentId ?? null,
        })
        .returning();
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
        throw new ActionError({ code: "CONFLICT", message: "Un dossier avec ce nom existe déjà dans ce répertoire." });
      }
      throw err;
    }

    auditAdmin(context, user.id, "MEDIA_FOLDER_CREATE", {
      resource: "media_folders",
      resourceId: created.id,
      metadata: { name: created.name, parentId: created.parentId, organizationId: tenant.organizationId },
    });

    invalidateCache("media:");
    return created;
  },
});

export const updateMediaFolder = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    name: z
      .string()
      .trim()
      .min(1, "Le nom du dossier est requis.")
      .max(200, "Le nom ne peut pas dépasser 200 caractères.")
      .optional(),
    parentId: z.string().nullable().optional(),
    organizationId: z.uuid().optional().nullable(),
  }),
  handler: async (input, context) => {
    const tenant = resolveMediaTenant(input);
    const user = await assertMediaPermission(context, tenant, { media: ["upload"] });
    adminRateLimit(context, user.id, "media");

    const { id, organizationId: _, ...data } = input;
    const db = getDrizzle();

    await assertFolderInTenant(id, tenant);
    if (data.parentId) {
      await assertFolderInTenant(data.parentId, tenant);
    }

    const [updated] = await db.transaction(async (tx) => {
      // Prevent moving a folder into itself or into one of its descendants
      if (data.parentId !== undefined && data.parentId !== null) {
        if (data.parentId === id) {
          throw new ActionError({ code: "BAD_REQUEST", message: "Un dossier ne peut pas être son propre parent." });
        }
        // Walk up the ancestor chain to detect cycles (inside transaction for TOCTOU safety)
        let currentId: string | null = data.parentId;
        const visited = new Set<string>([id]);
        while (currentId) {
          if (visited.has(currentId)) {
            throw new ActionError({ code: "BAD_REQUEST", message: "Déplacement impossible : référence circulaire détectée." });
          }
          visited.add(currentId);
          const [parent] = await tx
            .select({ parentId: mediaFolders.parentId })
            .from(mediaFolders)
            .where(eq(mediaFolders.id, currentId))
            .limit(1);
          currentId = parent?.parentId ?? null;
        }
      }

      try {
        return tx
          .update(mediaFolders)
          .set(data)
          .where(and(eq(mediaFolders.id, id), mediaFolderScope(tenant.organizationId)))
          .returning();
      } catch (err: unknown) {
        if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
          throw new ActionError({ code: "CONFLICT", message: "Un dossier avec ce nom existe déjà dans ce répertoire." });
        }
        throw err;
      }
    });

    if (!updated) {
      throw new ActionError({ code: "NOT_FOUND", message: "Dossier introuvable." });
    }

    auditAdmin(context, user.id, "MEDIA_FOLDER_UPDATE", {
      resource: "media_folders",
      resourceId: id,
      metadata: { name: updated.name, organizationId: tenant.organizationId },
    });

    invalidateCache("media:");
    return updated;
  },
});

export const deleteMediaFolder = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    organizationId: z.uuid().optional().nullable(),
  }),
  handler: async (input, context) => {
    const tenant = resolveMediaTenant(input);
    const user = await assertMediaPermission(context, tenant, { media: ["delete"] });
    adminRateLimit(context, user.id, "media");

    const db = getDrizzle();

    await assertFolderInTenant(input.id, tenant);

    // Check for child folders
    const children = await db
      .select({ id: mediaFolders.id })
      .from(mediaFolders)
      .where(and(eq(mediaFolders.parentId, input.id), mediaFolderScope(tenant.organizationId)))
      .limit(1);
    if (children.length > 0) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Impossible de supprimer un dossier contenant des sous-dossiers. Supprimez-les d'abord.",
      });
    }

    // Check for files in this folder
    const files = await db
      .select({ id: mediaFiles.id })
      .from(mediaFiles)
      .where(and(eq(mediaFiles.folderId, input.id), mediaFileScope(tenant.organizationId)))
      .limit(1);
    if (files.length > 0) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Impossible de supprimer un dossier contenant des fichiers. Déplacez-les ou supprimez-les d'abord.",
      });
    }

    const [deleted] = await db
      .delete(mediaFolders)
      .where(and(eq(mediaFolders.id, input.id), mediaFolderScope(tenant.organizationId)))
      .returning();

    if (!deleted) {
      throw new ActionError({ code: "NOT_FOUND", message: "Dossier introuvable." });
    }

    auditAdmin(context, user.id, "MEDIA_FOLDER_DELETE", {
      resource: "media_folders",
      resourceId: input.id,
      metadata: { name: deleted.name, organizationId: tenant.organizationId },
    });

    invalidateCache("media:");
    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════════════
// Files
// ═══════════════════════════════════════════════════════════════════════

export const uploadMediaFile = defineAction({
  accept: "form",
  input: z.object({
    file: z.instanceof(File),
    folderId: z.string().nullable().optional(),
    organizationId: z.uuid().optional().nullable(),
  }),
  handler: async (input, context) => {
    const tenant = resolveMediaTenant(input);
    const user = await assertMediaPermission(context, tenant, { media: ["upload"] });
    adminRateLimit(context, user.id, "media");

    const db = getDrizzle();

    // Validate folder exists if provided
    if (input.folderId) {
      await assertFolderInTenant(input.folderId, tenant);
    }

    // Upload file to disk via the existing media pipeline
    const result = await processUpload(input.file, { subDir: UPLOAD_DIRS.media });

    // Try reading image dimensions via sharp
    let width: number | null = null;
    let height: number | null = null;
    const RASTER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
    if (RASTER_TYPES.has(input.file.type)) {
      try {
        const sharp = (await import("sharp")).default;
        const metadata = await sharp(result.path).metadata();
        width = metadata.width ?? null;
        height = metadata.height ?? null;
      } catch {
        // Non-blocking — dimensions are optional
      }
    }

    const [created] = await db
      .insert(mediaFiles)
      .values({
        organizationId: tenant.organizationId,
        folderId: input.folderId ?? null,
        filename: input.file.name,
        url: result.url,
        mimeType: input.file.type,
        size: input.file.size,
        width,
        height,
      })
      .returning();

    auditAdmin(context, user.id, "MEDIA_FILE_UPLOAD", {
      resource: "media_files",
      resourceId: created.id,
      metadata: {
        filename: created.filename,
        mimeType: created.mimeType,
        size: created.size,
        folderId: created.folderId,
        organizationId: tenant.organizationId,
      },
    });

    invalidateCache("media:");
    return created;
  },
});

export const renameMediaFile = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    filename: z
      .string()
      .trim()
      .min(1, "Le nom de fichier est requis.")
      .max(255, "255 caractères maximum.")
      .refine(
        (name) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name),
        "Le nom ne peut contenir que des lettres, chiffres, tirets, underscores et points.",
      ),
    organizationId: z.uuid().optional().nullable(),
  }),
  handler: async (input, context) => {
    const tenant = resolveMediaTenant(input);
    const user = await assertMediaPermission(context, tenant, { media: ["upload"] });
    adminRateLimit(context, user.id, "media");

    const db = getDrizzle();

    const file = await assertFileInTenant(input.id, tenant);

    // Keep the original extension
    const origExt = extname(file.filename);
    const newExt = extname(input.filename);
    const finalName = newExt ? input.filename : `${input.filename}${origExt}`;

    // Rename on disk
    const uploadsRoot = resolve(process.cwd(), "public", "uploads");
    const oldDiskPath = join(process.cwd(), "public", file.url.slice(1));
    const dir = resolve(oldDiskPath, "..");
    const newDiskPath = join(dir, finalName);

    // Security: ensure new path stays inside uploads
    if (!resolve(newDiskPath).startsWith(uploadsRoot)) {
      throw new ActionError({ code: "BAD_REQUEST", message: "Chemin invalide." });
    }

    try {
      await rename(oldDiskPath, newDiskPath);
    } catch {
      throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Impossible de renommer le fichier sur le disque." });
    }

    // Also rename companion .webp if it exists
    const oldWebp = oldDiskPath.replace(/\.[^.]+$/, ".webp");
    const newWebp = newDiskPath.replace(/\.[^.]+$/, ".webp");
    if (oldWebp !== oldDiskPath) {
      await rename(oldWebp, newWebp).catch(() => {});
    }

    // Build new URL
    const urlDir = file.url.substring(0, file.url.lastIndexOf("/") + 1);
    const newUrl = `${urlDir}${finalName}`;

    let updated;
    try {
      [updated] = await db
        .update(mediaFiles)
        .set({ filename: finalName, url: newUrl })
        .where(and(eq(mediaFiles.id, input.id), mediaFileScope(tenant.organizationId)))
        .returning();
    } catch (err) {
      // Rollback disk rename on DB failure
      await rename(newDiskPath, oldDiskPath).catch(() => {});
      if (oldWebp !== oldDiskPath) {
        await rename(newWebp, oldWebp).catch(() => {});
      }
      throw err;
    }

    auditAdmin(context, user.id, "MEDIA_FILE_RENAME", {
      resource: "media_files",
      resourceId: input.id,
      metadata: { oldFilename: file.filename, newFilename: finalName, organizationId: tenant.organizationId },
    });

    invalidateCache("media:");
    return updated;
  },
});

export const moveMediaFile = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    folderId: z.string().nullable(),
    organizationId: z.uuid().optional().nullable(),
  }),
  handler: async (input, context) => {
    const tenant = resolveMediaTenant(input);
    const user = await assertMediaPermission(context, tenant, { media: ["upload"] });
    adminRateLimit(context, user.id, "media");

    const db = getDrizzle();

    await assertFileInTenant(input.id, tenant);

    if (input.folderId) {
      await assertFolderInTenant(input.folderId, tenant);
    }

    const [updated] = await db
      .update(mediaFiles)
      .set({ folderId: input.folderId })
      .where(and(eq(mediaFiles.id, input.id), mediaFileScope(tenant.organizationId)))
      .returning();

    if (!updated) {
      throw new ActionError({ code: "NOT_FOUND", message: "Fichier introuvable." });
    }

    auditAdmin(context, user.id, "MEDIA_FILE_MOVE", {
      resource: "media_files",
      resourceId: input.id,
      metadata: { folderId: input.folderId, organizationId: tenant.organizationId },
    });

    invalidateCache("media:");
    return updated;
  },
});

export const deleteMediaFile = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    organizationId: z.uuid().optional().nullable(),
  }),
  handler: async (input, context) => {
    const tenant = resolveMediaTenant(input);
    const user = await assertMediaPermission(context, tenant, { media: ["delete"] });
    adminRateLimit(context, user.id, "media");

    const db = getDrizzle();

    const file = await assertFileInTenant(input.id, tenant);

    // Delete from disk
    try {
      await deleteUpload(file.url);
    } catch {
      // File may already be deleted from disk — that's fine, continue with DB cleanup
    }

    // Delete from DB (alts cascade)
    await db.delete(mediaFiles).where(and(eq(mediaFiles.id, input.id), mediaFileScope(tenant.organizationId)));

    auditAdmin(context, user.id, "MEDIA_FILE_DELETE", {
      resource: "media_files",
      resourceId: input.id,
      metadata: { filename: file.filename, url: file.url, organizationId: tenant.organizationId },
    });

    invalidateCache("media:");
    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════════════
// Alt Texts (i18n)
// ═══════════════════════════════════════════════════════════════════════

export const upsertMediaFileAlt = defineAction({
  input: z.object({
    fileId: z.string().min(1, "L'identifiant du fichier est requis."),
    locale: localeEnum,
    alt: z.string().trim().min(1, "Le texte alternatif est requis.").max(500, "500 caractères maximum."),
    title: z.string().trim().max(500, "500 caractères maximum.").nullable().optional(),
    organizationId: z.uuid().optional().nullable(),
  }),
  handler: async (input, context) => {
    const tenant = resolveMediaTenant(input);
    const user = await assertMediaPermission(context, tenant, { media: ["upload"] });
    adminRateLimit(context, user.id, "media");

    const db = getDrizzle();

    // Ensure file exists
    await assertFileInTenant(input.fileId, tenant);

    // Upsert: update if exists, otherwise insert
    const [existing] = await db
      .select({ id: mediaFileAlts.id })
      .from(mediaFileAlts)
      .where(
        and(
          eq(mediaFileAlts.fileId, input.fileId),
          eq(mediaFileAlts.locale, input.locale),
        ),
      )
      .limit(1);

    let result;
    if (existing) {
      [result] = await db
        .update(mediaFileAlts)
        .set({ alt: input.alt, title: input.title ?? null })
        .where(eq(mediaFileAlts.id, existing.id))
        .returning();
    } else {
      [result] = await db
        .insert(mediaFileAlts)
        .values({
          fileId: input.fileId,
          locale: input.locale,
          alt: input.alt,
          title: input.title ?? null,
        })
        .returning();
    }

    auditAdmin(context, user.id, "MEDIA_FILE_ALT_UPDATE", {
      resource: "media_file_alts",
      resourceId: result.id,
      metadata: { fileId: input.fileId, locale: input.locale, organizationId: tenant.organizationId },
    });

    invalidateCache("media:");
    return result;
  },
});

export const deleteMediaFileAlt = defineAction({
  input: z.object({
    fileId: z.string().min(1),
    locale: localeEnum,
    organizationId: z.uuid().optional().nullable(),
  }),
  handler: async (input, context) => {
    const tenant = resolveMediaTenant(input);
    const user = await assertMediaPermission(context, tenant, { media: ["delete"] });
    adminRateLimit(context, user.id, "media");

    const db = getDrizzle();

    await assertFileInTenant(input.fileId, tenant);

    const [deleted] = await db
      .delete(mediaFileAlts)
      .where(
        and(
          eq(mediaFileAlts.fileId, input.fileId),
          eq(mediaFileAlts.locale, input.locale),
        ),
      )
      .returning();

    if (!deleted) {
      throw new ActionError({ code: "NOT_FOUND", message: "Texte alternatif introuvable pour cette locale." });
    }

    auditAdmin(context, user.id, "MEDIA_FILE_ALT_DELETE", {
      resource: "media_file_alts",
      resourceId: deleted.id,
      metadata: { fileId: input.fileId, locale: input.locale, organizationId: tenant.organizationId },
    });

    invalidateCache("media:");
    return { success: true };
  },
});
