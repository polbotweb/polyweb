/**
 * POST /api/forms/{slug} — soumission JSON d'un formulaire (front headless).
 * Corps : { "<champ>": valeur, ..., "_hp"?: "" , "locale"?: "fr" }.
 */
import { Effect } from 'effect';
import { apiRoute, json } from '@/lib/effect/http';
import { readJson } from '@/lib/effect/schema';
import { ValidationError } from '@/lib/effect/errors';
import { extractIp } from '@/lib/audit';
import { submitForm } from '@/modules/forms/domain/forms';
import { DEFAULT_SITE_ID } from '@database/schemas/content.schema';
import { corsHeaders, preflight } from '@/modules/api/domain/v1';

export const prerender = false;
export const OPTIONS = preflight;
export const POST = apiRoute((ctx) =>
  Effect.gen(function* () {
    const body = yield* readJson(ctx.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return yield* new ValidationError({ issues: [{ path: '', message: 'Objet JSON attendu' }] });
    const raw = body as Record<string, unknown>;
    const locale = typeof raw.locale === 'string' && /^[a-z]{2}$/.test(raw.locale) ? raw.locale : 'fr';
    let ip: string | null = null;
    try { ip = extractIp(ctx.request.headers, ctx.clientAddress); } catch { ip = null; }
    const outcome = yield* submitForm(ctx.locals.site?.id ?? DEFAULT_SITE_ID, ctx.params.slug ?? '', raw, {
      ip,
      userAgent: ctx.request.headers.get('user-agent'),
      locale,
      requireTimestamp: false,
    });
    return json({ ok: true, message: outcome.message }, { status: 201, headers: corsHeaders() });
  }),
);
