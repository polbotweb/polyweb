import { defineAction, ActionError, type ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, isNull } from "drizzle-orm";
import { rename } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { getDrizzle } from "@database/drizzle";
import { mediaFolders, mediaFiles, mediaFileAlts } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { processUpload } from "@/media/upload";
import { serializeVariants } from "@/media/variants";
import { deleteUpload } from "@/media/delete";
import { UPLOAD_DIRS } from "@/media/types";
import { auditAdmin } from "./_helpers";
import { LOCALES } from "@i18n/config";
import { Effect } from "effect";
import { actionRateLimit, actionTry, effectHandler, fail, requireActionPermission } from "@/lib/effect/action";

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

type MediaPermissions = Parameters<typeof requireActionPermission>[1];

/** Admin global : passe ; contexte organisation : owner/admin du membre ; puis RBAC better-auth. */
const requireMediaPermission = (context: ActionAPIContext, tenant: MediaTenantContext, permissions: MediaPermissions) =>
  Effect.gen(function* () {
    const user = context.locals.user;
    if (!user) return yield* fail("UNAUTHORIZED", "Vous devez être connecté pour effectuer cette action.");
    if (user.banned) return yield* fail("FORBIDDEN", "Compte suspendu.");
    if (user.role === "admin") return user;
    if (tenant.isOrgContext) {
      const fullOrg = yield* actionTry("auth.getFullOrganization", () =>
        import("@/lib/auth").then(({ auth }) => auth.api.getFullOrganization({ query: { organizationId: tenant.organizationId! }, headers: context.request.headers })),
      );
      if (!fullOrg) return yield* fail("NOT_FOUND", "Organisation introuvable.");
      const member = (fullOrg.members ?? []).find((item: { userId: string }) => item.userId === user.id);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        return yield* fail("FORBIDDEN", "Vous devez être propriétaire ou administrateur de cette organisation.");
      }
    }
    return yield* requireActionPermission(context, permissions);
  });

const ownedBy = <T extends { organizationId: string | null }>(op: string, missing: string, foreign: string, load: () => Promise<T[]>, tenant: MediaTenantContext) =>
  Effect.gen(function* () {
    const [item] = yield* actionTry(op, load);
    if (!item) return yield* fail("NOT_FOUND", missing);
    if ((item.organizationId ?? null) !== tenant.organizationId) return yield* fail("FORBIDDEN", foreign);
    return item;
  });

const folderInTenant = (folderId: string, tenant: MediaTenantContext) =>
  ownedBy("media.folder.tenant", "Dossier introuvable.", "Ce dossier n'appartient pas à ce tenant.", () =>
    getDrizzle().select({ id: mediaFolders.id, organizationId: mediaFolders.organizationId, parentId: mediaFolders.parentId }).from(mediaFolders).where(eq(mediaFolders.id, folderId)).limit(1), tenant);

const fileInTenant = (fileId: string, tenant: MediaTenantContext) =>
  ownedBy("media.file.tenant", "Fichier introuvable.", "Ce fichier n'appartient pas à ce tenant.", () => getDrizzle().select().from(mediaFiles).where(eq(mediaFiles.id, fileId)).limit(1), tenant);


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
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveMediaTenant(input);
    const user = yield* requireMediaPermission(context, tenant, { media: ["upload"] });
    yield* actionRateLimit(user.id, "media");
    // Validate parent exists if provided
    if (input.parentId) yield* folderInTenant(input.parentId, tenant);
    return yield* actionTry("admin/media.createMediaFolder", async () => {
    const db = getDrizzle();

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
    });
  })),
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
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveMediaTenant(input);
    const user = yield* requireMediaPermission(context, tenant, { media: ["upload"] });
    yield* actionRateLimit(user.id, "media");
    const { id, organizationId: _, ...data } = input;
    yield* folderInTenant(id, tenant);
    if (data.parentId) yield* folderInTenant(data.parentId, tenant);
    return yield* actionTry("admin/media.updateMediaFolder", async () => {
    const db = getDrizzle();

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
    });
  })),
});

export const deleteMediaFolder = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    organizationId: z.uuid().optional().nullable(),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveMediaTenant(input);
    const user = yield* requireMediaPermission(context, tenant, { media: ["delete"] });
    yield* actionRateLimit(user.id, "media");
    yield* folderInTenant(input.id, tenant);
    return yield* actionTry("admin/media.deleteMediaFolder", async () => {
    const db = getDrizzle();

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
    });
  })),
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
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveMediaTenant(input);
    const user = yield* requireMediaPermission(context, tenant, { media: ["upload"] });
    yield* actionRateLimit(user.id, "media");
    // Validate folder exists if provided
    if (input.folderId) yield* folderInTenant(input.folderId, tenant);
    return yield* actionTry("admin/media.uploadMediaFile", async () => {
    const db = getDrizzle();

    // Upload file to disk via the existing media pipeline
    const result = await processUpload(input.file, { subDir: UPLOAD_DIRS.media });

    // Dimensions vérifiées par décodage réel dans processUpload (voir src/media/variants.ts)
    const width: number | null = result.dimensions?.width ?? null;
    const height: number | null = result.dimensions?.height ?? null;

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
        variants: serializeVariants(result.variants),
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
    });
  })),
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
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveMediaTenant(input);
    const user = yield* requireMediaPermission(context, tenant, { media: ["upload"] });
    yield* actionRateLimit(user.id, "media");
    const file = yield* fileInTenant(input.id, tenant);
    return yield* actionTry("admin/media.renameMediaFile", async () => {
    const db = getDrizzle();

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
    });
  })),
});

export const moveMediaFile = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    folderId: z.string().nullable(),
    organizationId: z.uuid().optional().nullable(),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveMediaTenant(input);
    const user = yield* requireMediaPermission(context, tenant, { media: ["upload"] });
    yield* actionRateLimit(user.id, "media");
    yield* fileInTenant(input.id, tenant);
    if (input.folderId) yield* folderInTenant(input.folderId, tenant);
    return yield* actionTry("admin/media.moveMediaFile", async () => {
    const db = getDrizzle();


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
    });
  })),
});

export const deleteMediaFile = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    organizationId: z.uuid().optional().nullable(),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveMediaTenant(input);
    const user = yield* requireMediaPermission(context, tenant, { media: ["delete"] });
    yield* actionRateLimit(user.id, "media");
    const file = yield* fileInTenant(input.id, tenant);
    return yield* actionTry("admin/media.deleteMediaFile", async () => {
    const db = getDrizzle();

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
    });
  })),
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
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveMediaTenant(input);
    const user = yield* requireMediaPermission(context, tenant, { media: ["upload"] });
    yield* actionRateLimit(user.id, "media");
    yield* fileInTenant(input.fileId, tenant);
    return yield* actionTry("admin/media.upsertMediaFileAlt", async () => {
    const db = getDrizzle();

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
    });
  })),
});

export const deleteMediaFileAlt = defineAction({
  input: z.object({
    fileId: z.string().min(1),
    locale: localeEnum,
    organizationId: z.uuid().optional().nullable(),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveMediaTenant(input);
    const user = yield* requireMediaPermission(context, tenant, { media: ["delete"] });
    yield* actionRateLimit(user.id, "media");
    yield* fileInTenant(input.fileId, tenant);
    return yield* actionTry("admin/media.deleteMediaFileAlt", async () => {
    const db = getDrizzle();

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
    });
  })),
});
