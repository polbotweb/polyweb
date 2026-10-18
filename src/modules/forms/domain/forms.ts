/**
 * Constructeur de formulaires (brique g) — Effect natif.
 *
 * Les champs réutilisent les définitions dynamiques des types de contenu
 * (`@/core/content-types/fields`, restreintes à FORM_FIELD_TYPES) ; la
 * validation des soumissions est donc identique à celle des entrées.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { Clock, Effect, Schema } from 'effect';
import { schema } from '@database/drizzle';
import { FORM_STATUSES, FORM_SUBMISSION_STATUSES, type FormSettings, type FormSubmissionStatus } from '@database/schemas/forms.schema';
import { buildDataSchema, fieldListSchema, FORM_FIELD_TYPES, labelFor, type FieldDefinition } from '@/core/content-types/fields';
import { emitEvent } from '@/core/events';
import { query } from '@/lib/effect/db';
import { AppConfig } from '@/lib/effect/config';
import { ConflictError, NotFoundError, RateLimitedError, ValidationError } from '@/lib/effect/errors';
import { decode } from '@/lib/effect/schema';
import { checkRateLimit } from '@/lib/rate-limit';
import { Mailer } from '@/smtp/mailer';

export type Form = typeof schema.forms.$inferSelect;
export type FormSubmission = typeof schema.formSubmissions.$inferSelect;

const isUniqueViolation = (e: unknown) => (e as { cause?: { code?: string }; code?: string })?.cause?.code === '23505' || (e as { code?: string })?.code === '23505';

// ─── Définition ──────────────────────────────────────────────────────

const LocalizedText = Schema.Record(Schema.String, Schema.String.pipe(Schema.check(Schema.isMaxLength(1000))));
const Email = Schema.Trim.pipe(Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/), Schema.isMaxLength(254)));

export const FormInput = Schema.Struct({
  slug: Schema.Trim.pipe(Schema.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,62}$/))),
  name: Schema.Trim.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(160))),
  description: Schema.optional(Schema.NullOr(Schema.String.pipe(Schema.check(Schema.isMaxLength(2000))))),
  fields: Schema.Unknown,
  status: Schema.optional(Schema.Literals(FORM_STATUSES)),
  settings: Schema.optional(
    Schema.Struct({
      successMessage: Schema.optional(LocalizedText),
      submitLabel: Schema.optional(LocalizedText),
      notifyEmails: Schema.optional(Schema.Array(Email).pipe(Schema.check(Schema.isMaxLength(10)))),
      storeSubmissions: Schema.optional(Schema.Boolean),
      redirectPath: Schema.optional(Schema.String.pipe(Schema.check(Schema.isPattern(/^\/(?!\/)[^\s]*$/), Schema.isMaxLength(300)))),
    }),
  ),
});

/** Valide la liste de champs (zod partagé avec les types de contenu) → ValidationError. */
const parseFields = (raw: unknown) =>
  Effect.gen(function* () {
    const value = typeof raw === 'string' ? yield* Effect.try({ try: () => JSON.parse(raw || '[]') as unknown, catch: () => new ValidationError({ issues: [{ path: 'fields', message: 'JSON invalide' }] }) }) : raw;
    const parsed = fieldListSchema(FORM_FIELD_TYPES).safeParse(value);
    if (!parsed.success) {
      return yield* new ValidationError({ issues: parsed.error.issues.map((i) => ({ path: ['fields', ...i.path.map(String)].join('.'), message: i.message })) });
    }
    return parsed.data as FieldDefinition[];
  });

const prepare = (input: unknown) =>
  Effect.gen(function* () {
    const data = yield* decode(FormInput)(input);
    const fields = yield* parseFields(data.fields);
    return { ...data, fields, settings: (data.settings ?? {}) as FormSettings };
  });

export const createForm = (siteId: string, input: unknown) =>
  Effect.gen(function* () {
    const d = yield* prepare(input);
    const rows = yield* query('forms.create', (db) =>
      db.insert(schema.forms).values({ siteId, slug: d.slug, name: d.name, description: d.description ?? null, fields: d.fields, settings: d.settings, status: d.status ?? 'active' }).returning(),
    ).pipe(Effect.mapError((e) => (isUniqueViolation(e.cause) ? new ConflictError({ reason: `Le formulaire « ${d.slug} » existe déjà` }) : e)));
    return rows[0]!;
  });

export const updateForm = (siteId: string, id: string, input: unknown) =>
  Effect.gen(function* () {
    const d = yield* prepare(input);
    const rows = yield* query('forms.update', (db) =>
      db
        .update(schema.forms)
        .set({ slug: d.slug, name: d.name, description: d.description ?? null, fields: d.fields, settings: d.settings, status: d.status ?? 'active' })
        .where(and(eq(schema.forms.id, id), eq(schema.forms.siteId, siteId)))
        .returning(),
    ).pipe(Effect.mapError((e) => (isUniqueViolation(e.cause) ? new ConflictError({ reason: `Le slug « ${d.slug} » est déjà utilisé` }) : e)));
    if (!rows[0]) return yield* new NotFoundError({ entity: 'Form', id });
    return rows[0];
  });

export const deleteForm = (siteId: string, id: string) =>
  Effect.gen(function* () {
    const rows = yield* query('forms.delete', (db) => db.delete(schema.forms).where(and(eq(schema.forms.id, id), eq(schema.forms.siteId, siteId))).returning({ id: schema.forms.id }));
    if (!rows[0]) return yield* new NotFoundError({ entity: 'Form', id });
  });

export const listForms = (siteId: string) =>
  Effect.gen(function* () {
    const rows = yield* query('forms.list', (db) => db.select().from(schema.forms).where(eq(schema.forms.siteId, siteId)).orderBy(asc(schema.forms.name)));
    const counts = yield* query('forms.counts', (db) =>
      db.select({ formId: schema.formSubmissions.formId, n: count() }).from(schema.formSubmissions).innerJoin(schema.forms, eq(schema.forms.id, schema.formSubmissions.formId)).where(eq(schema.forms.siteId, siteId)).groupBy(schema.formSubmissions.formId),
    );
    const byId = new Map(counts.map((c) => [c.formId, Number(c.n)]));
    return rows.map((f) => ({ ...f, submissions: byId.get(f.id) ?? 0 }));
  });

export const getForm = (siteId: string, idOrSlug: string) =>
  Effect.flatMap(
    query('forms.get', (db) =>
      db.select().from(schema.forms).where(and(eq(schema.forms.siteId, siteId), /^[0-9a-f-]{36}$/.test(idOrSlug) ? eq(schema.forms.id, idOrSlug) : eq(schema.forms.slug, idOrSlug))).limit(1),
    ),
    ([f]) => (f ? Effect.succeed(f) : Effect.fail(new NotFoundError({ entity: 'Form', id: idOrSlug }))),
  );

// ─── Anti-spam ───────────────────────────────────────────────────────

const MIN_FILL_MS = 2_000;
const MAX_FILL_MS = 86_400_000;
const tsMac = (secret: string, t: string) => createHmac('sha256', `polyweb:form-ts:${secret}`).update(t).digest('base64url').slice(0, 22);

/** Jeton horodaté signé, inséré dans le formulaire HTML (champ `_ts`). */
export const formTimestampToken = Effect.gen(function* () {
  const config = yield* AppConfig;
  const t = String(yield* Clock.currentTimeMillis);
  return `${t}.${tsMac(config.signingSecret, t)}`;
});

/** true si le jeton est valide ET le formulaire a été rempli en un temps humain. */
export const checkTimestampToken = (token: string | undefined) =>
  Effect.gen(function* () {
    if (!token) return false;
    const config = yield* AppConfig;
    const [t, sig] = token.split('.');
    if (!t || !sig || !/^\d{10,16}$/.test(t)) return false;
    const expected = Buffer.from(tsMac(config.signingSecret, t));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    const elapsed = (yield* Clock.currentTimeMillis) - Number(t);
    return elapsed >= MIN_FILL_MS && elapsed <= MAX_FILL_MS;
  });

// ─── Soumission ──────────────────────────────────────────────────────

export interface SubmitMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly locale: string;
  /** Soumission HTML : `_ts` obligatoire. Les clients JSON (API) en sont dispensés. */
  readonly requireTimestamp: boolean;
}

export type SubmitOutcome = { status: 'accepted'; submissionId: string | null; message: string; redirectPath?: string } | { status: 'discarded'; message: string };

const SUBMIT_LIMIT = { window: 60, max: Number(process.env.FORM_RATE_LIMIT ?? 5) };

export const successMessage = (form: Form, locale: string) =>
  form.settings.successMessage?.[locale] || form.settings.successMessage?.fr || 'Merci, votre message a bien été envoyé.';

export const submitForm = (siteId: string, slug: string, raw: Record<string, unknown>, meta: SubmitMeta) =>
  Effect.gen(function* () {
    const form = yield* getForm(siteId, slug);
    if (form.status !== 'active') return yield* new ConflictError({ reason: 'Ce formulaire est fermé' });

    const ipHash = meta.ip ? createHash('sha256').update(`polyweb:${meta.ip}`).digest('hex').slice(0, 32) : null;
    const rl = checkRateLimit(`form:${form.id}:${ipHash ?? 'anon'}`, SUBMIT_LIMIT);
    if (!rl.allowed) return yield* new RateLimitedError({ retryAfterSeconds: Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)) });

    const message = successMessage(form, meta.locale);
    // Pot de miel : on répond « succès » au robot sans rien enregistrer.
    if (typeof raw._hp === 'string' && raw._hp.trim() !== '') return { status: 'discarded', message } satisfies SubmitOutcome as SubmitOutcome;
    const humanTiming = yield* checkTimestampToken(typeof raw._ts === 'string' ? raw._ts : undefined);
    const suspicious = meta.requireTimestamp && !humanTiming;

    const parsed = buildDataSchema(form.fields, 'all').safeParse(raw);
    if (!parsed.success) {
      return yield* new ValidationError({ issues: parsed.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })) });
    }
    const data = parsed.data as Record<string, unknown>;

    let submissionId: string | null = null;
    if (form.settings.storeSubmissions !== false || suspicious) {
      const [row] = yield* query('forms.submit', (db) =>
        db
          .insert(schema.formSubmissions)
          .values({ formId: form.id, data, locale: meta.locale, ipHash, userAgent: meta.userAgent?.slice(0, 300) ?? null, status: suspicious ? 'spam' : 'new' })
          .returning({ id: schema.formSubmissions.id }),
      );
      submissionId = row!.id;
    }
    // Soumission suspecte (envoi trop rapide / sans jeton) : conservée en « spam », sans notification ni événement.
    if (suspicious) return { status: 'discarded', message } satisfies SubmitOutcome as SubmitOutcome;

    yield* Effect.promise(() => emitEvent('form.submitted', { formId: form.id, form: form.slug, submissionId, data, locale: meta.locale }, { siteId }));
    yield* notify(form, data, meta.locale);
    return { status: 'accepted', submissionId, message, redirectPath: form.settings.redirectPath } satisfies SubmitOutcome as SubmitOutcome;
  }).pipe(Effect.withSpan('forms.submit', { attributes: { slug } }));

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderNotification(form: Form, data: Record<string, unknown>, locale: string) {
  const rows = form.fields.map((f) => {
    const v = data[f.name];
    const text = v === undefined ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v);
    return { label: labelFor(f.label, locale), text };
  });
  const subject = `[${form.name}] Nouvelle soumission`.replace(/[\r\n]+/g, ' ');
  const html = `<h1>${escapeHtml(form.name)}</h1><table>${rows.map((r) => `<tr><th align="left">${escapeHtml(r.label)}</th><td>${escapeHtml(r.text).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>`;
  const text = rows.map((r) => `${r.label}: ${r.text}`).join('\n');
  return { subject, html, text };
}

/** Notifications e-mail : en tâche de fond, une erreur n'empêche jamais la soumission. */
const notify = (form: Form, data: Record<string, unknown>, locale: string) =>
  Effect.gen(function* () {
    const to = form.settings.notifyEmails ?? [];
    if (to.length === 0) return;
    const mailer = yield* Mailer;
    const { subject, html, text } = renderNotification(form, data, locale);
    yield* Effect.forEach(to, (addr) => mailer.send({ to: addr, subject, html, text }).pipe(Effect.tapError((e) => Effect.logWarning('form notification failed', e)), Effect.ignore), { concurrency: 3 });
  });

// ─── Soumissions (admin / API) ───────────────────────────────────────

export const listSubmissions = (formId: string, opts: { limit?: number; offset?: number; status?: FormSubmissionStatus } = {}) =>
  Effect.gen(function* () {
    const where = opts.status ? and(eq(schema.formSubmissions.formId, formId), eq(schema.formSubmissions.status, opts.status)) : eq(schema.formSubmissions.formId, formId);
    const [items, [total]] = yield* Effect.all([
      query('forms.submissions', (db) => db.select().from(schema.formSubmissions).where(where).orderBy(desc(schema.formSubmissions.createdAt)).limit(Math.min(opts.limit ?? 50, 500)).offset(opts.offset ?? 0)),
      query('forms.submissions.count', (db) => db.select({ n: count() }).from(schema.formSubmissions).where(where)),
    ]);
    return { items, total: Number(total?.n ?? 0) };
  });

export const setSubmissionStatus = (formId: string, id: string, status: FormSubmissionStatus) =>
  Effect.gen(function* () {
    if (!(FORM_SUBMISSION_STATUSES as readonly string[]).includes(status)) return yield* new ValidationError({ issues: [{ path: 'status', message: 'statut invalide' }] });
    const rows = yield* query('forms.submission.status', (db) => db.update(schema.formSubmissions).set({ status }).where(and(eq(schema.formSubmissions.id, id), eq(schema.formSubmissions.formId, formId))).returning({ id: schema.formSubmissions.id }));
    if (!rows[0]) return yield* new NotFoundError({ entity: 'FormSubmission', id });
  });

export const deleteSubmission = (formId: string, id: string) =>
  Effect.gen(function* () {
    const rows = yield* query('forms.submission.delete', (db) => db.delete(schema.formSubmissions).where(and(eq(schema.formSubmissions.id, id), eq(schema.formSubmissions.formId, formId))).returning({ id: schema.formSubmissions.id }));
    if (!rows[0]) return yield* new NotFoundError({ entity: 'FormSubmission', id });
  });

/** Cellule CSV sûre : guillemets doublés + neutralisation des formules tableur (=, +, -, @). */
export function csvCell(v: unknown): string {
  let s = v === undefined || v === null ? '' : Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export const exportSubmissionsCsv = (form: Form, locale: string) =>
  Effect.gen(function* () {
    const rows = yield* query('forms.export', (db) => db.select().from(schema.formSubmissions).where(eq(schema.formSubmissions.formId, form.id)).orderBy(asc(schema.formSubmissions.createdAt)));
    const header = ['id', 'date', 'statut', 'langue', ...form.fields.map((f) => labelFor(f.label, locale))];
    const lines = rows.map((r) => [r.id, r.createdAt.toISOString(), r.status, r.locale ?? '', ...form.fields.map((f) => r.data[f.name])].map(csvCell).join(','));
    // BOM UTF-8 pour Excel.
    return `\uFEFF${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
  });
