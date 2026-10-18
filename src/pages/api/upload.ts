import type { APIRoute } from 'astro';
import { auth } from '@/lib/auth';
import { processUpload, UploadError } from '@/media/upload';
import { deleteUpload } from '@/media/delete';
import { UPLOAD_DIRS, type UploadType } from '@/media/types';
import { logAuditEvent, extractIp } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // ─── Auth obligatoire ──────────────────────────────────────────────
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: 'Non authentifié' }, { status: 401 });
  }

  // ─── Rate limit (10 uploads / 60s par IP) ──────────────────────────
  const ip = extractIp(request.headers) ?? session.user.id;
  const rl = checkRateLimit(`upload:${ip}`, { window: 60, max: 10 });
  if (!rl.allowed) {
    return Response.json(
      { error: 'Trop de requêtes. Réessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  // ─── Parse multipart ──────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Le body doit être multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: 'Champ "file" manquant ou vide' }, { status: 400 });
  }

  const type = formData.get('type') as string | null;
  if (!type || !(type in UPLOAD_DIRS)) {
    const allowed = Object.keys(UPLOAD_DIRS).join(', ');
    return Response.json(
      { error: `Champ "type" requis. Valeurs acceptées : ${allowed}` },
      { status: 400 },
    );
  }

  // ─── Upload ────────────────────────────────────────────────────────
  try {
    const result = await processUpload(file, {
      subDir: UPLOAD_DIRS[type as UploadType],
    });

    // Nettoyage de l'ancien fichier si oldUrl fourni
    // Restrict to the same upload-type directory to prevent cross-type deletion
    const oldUrl = formData.get('oldUrl') as string | null;
    const expectedDir = `/uploads/${UPLOAD_DIRS[type as UploadType]}/`;
    if (oldUrl?.startsWith(expectedDir)) {
      // Validate URL contains only safe path characters (no path traversal)
      if (/^\/uploads\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(oldUrl)) {
        try { await deleteUpload(oldUrl); } catch { /* ancien fichier déjà absent */ }
      }
    }

    // Audit log
    void logAuditEvent({
      userId: session.user.id,
      action: 'FILE_UPLOAD',
      resource: 'file',
      resourceId: result.url,
      metadata: { type, originalName: file.name, size: file.size },
      ipAddress: extractIp(request.headers, clientAddress),
      userAgent: request.headers.get('user-agent'),
    });

    return Response.json({ url: result.url }, { status: 201 });
  } catch (err) {
    if (err instanceof UploadError) {
      return Response.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error('[upload] Erreur inattendue:', err);
    return Response.json({ error: 'Erreur serveur lors de l\'upload' }, { status: 500 });
  }
};
