/** POST /api/upload — upload multipart (session requise, 10/min/IP). */
import { Effect } from 'effect';
import { auth } from '@/lib/auth';
import { uploadFile } from '@/media/upload';
import { deleteMediaByUrl } from '@/media/delete';
import { UPLOAD_DIRS, type UploadType } from '@/media/types';
import { logAuditEvent, extractIp } from '@/lib/audit';
import { apiRoute } from '@/lib/effect/http';
import { attempt, rateLimit, retryAfterSeconds } from '@/lib/effect/route';

export const prerender = false;

export const POST = apiRoute(({ request, clientAddress }) =>
  Effect.gen(function* () {
    const session = yield* attempt('auth.session', () => auth.api.getSession({ headers: request.headers }));
    if (!session) return Response.json({ error: 'Non authentifié' }, { status: 401 });

    const ip = extractIp(request.headers) ?? session.user.id;
    const rl = yield* rateLimit(`upload:${ip}`, { window: 60, max: 10 });
    if (!rl.allowed) return Response.json({ error: 'Trop de requêtes. Réessayez plus tard.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds(rl) } });

    const form = yield* Effect.tryPromise(() => request.formData()).pipe(Effect.option);
    if (form._tag === 'None') return Response.json({ error: 'Le body doit être multipart/form-data' }, { status: 400 });
    const formData = form.value;

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return Response.json({ error: 'Champ "file" manquant ou vide' }, { status: 400 });
    const type = formData.get('type') as string | null;
    if (!type || !(type in UPLOAD_DIRS)) {
      return Response.json({ error: `Champ "type" requis. Valeurs acceptées : ${Object.keys(UPLOAD_DIRS).join(', ')}` }, { status: 400 });
    }
    const dir = UPLOAD_DIRS[type as UploadType];

    const uploaded = yield* uploadFile(file, { subDir: dir }).pipe(Effect.result);
    if (uploaded._tag === 'Failure') return Response.json({ error: uploaded.failure.reason, code: uploaded.failure.code }, { status: 400 });
    const result = uploaded.success;

    // Nettoyage de l'ancien fichier (même dossier de type uniquement).
    const oldUrl = formData.get('oldUrl') as string | null;
    const localOld = !!oldUrl?.startsWith(`/uploads/${dir}/`) && /^\/uploads\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(oldUrl!);
    const remoteOld = !!oldUrl && /^https:\/\/[^\s?#]+\/[0-9a-f-]{36}\.[a-z0-9]+$/.test(oldUrl) && oldUrl.includes(`/${dir}/`);
    if (oldUrl && (localOld || remoteOld)) yield* Effect.ignore(deleteMediaByUrl(oldUrl));

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
  }),
);
