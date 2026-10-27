/**
 * Parcours de réservation public (visiteur, sans compte) : lecture des ressources actives du
 * tenant, créneaux libres d'un jour, demande de réservation (anti-spam aligné sur les formulaires
 * publics : limite de débit par IP, pot de miel `_hp`, jeton temporel signé `_ts`), e-mail de
 * confirmation et consultation / annulation par lien signé. Tout est Effect ; les pages Astro
 * n'appellent que ces fonctions via `runAppResult`.
 */
import { createHash } from "node:crypto";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import type { Locale } from "@i18n/config";
import { getDrizzle } from "@database/drizzle";
import { organization } from "@database/schemas/auth.schema";
import { AppConfig } from "@/lib/effect/config";
import { RateLimitedError } from "@/lib/effect/errors";
import { dbTry } from "@/lib/effect/run";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEventEffect } from "@/lib/audit";
import { formatZoned, localDate } from "@/core/scheduling";
import { Mailer } from "@smtp/mailer";
import { checkTimestampToken } from "@/modules/forms/domain/forms";
import { bookingsLoader } from "../loaders/bookings.loader";
import { bookingsService } from "../services/bookings.service";
import { addIsoDays, BOOKING_HORIZON_DAYS, guestToken, InvalidGuestError, isBookableDate, validateGuest, verifyGuestToken, type GuestField } from "../domain/guest";
import { guestConfirmationEmail } from "./email";

import { manageUrlPath, type PublicTenant } from "./paths";

export { manageUrlPath, PLATFORM_TENANT, publicBasePath, type PublicTenant } from "./paths";

/** Organisation par slug (pages `/[lang]/[organization]/bookings/…`) ; `null` si inconnue. */
export const resolveTenant = (orgSlug: string) =>
  dbTry("bookings.public.tenant", () => getDrizzle().select({ id: organization.id, name: organization.name, slug: organization.slug }).from(organization).where(eq(organization.slug, orgSlug)).limit(1))
    .pipe(Effect.map((rows): PublicTenant | null => (rows[0] ? { organizationId: rows[0].id, slug: rows[0].slug, name: rows[0].name } : null)));

export const publicResources = (tenant: PublicTenant) => bookingsLoader.resources(tenant.organizationId, { activeOnly: true });

/** Ressource active du tenant par code ; `null` sinon (404). */
export const publicResource = (tenant: PublicTenant, code: string) =>
  bookingsLoader.resourceByCode(code, tenant.organizationId).pipe(Effect.map((r) => (r && r.active ? r : null)));

type Resource = NonNullable<Effect.Success<ReturnType<typeof publicResource>>>;

/** Fenêtre de dates proposée (date locale de la ressource). */
export const bookableRange = (resource: Resource, now: Date) => {
  const min = localDate(now, resource.timezone);
  return { min, max: addIsoDays(min, BOOKING_HORIZON_DAYS) };
};

/** Créneaux libres du jour (`date` invalide ou hors horizon → `valid: false`, aucun créneau). */
export const publicDay = (tenant: PublicTenant, resource: Resource, date: string, now: Date) =>
  Effect.gen(function* () {
    const range = bookableRange(resource, now);
    if (!isBookableDate(date, range.min)) return { valid: false as const, date, range, slots: [] as const };
    const day = yield* bookingsLoader.availability(resource.id, tenant.organizationId, date, { notBefore: now });
    return { valid: true as const, date, range, slots: day?.slots ?? [] };
  });

export interface GuestSubmission {
  readonly startsAt?: string;
  readonly customerName?: string;
  readonly customerEmail?: string;
  readonly customerPhone?: string;
  readonly partySize?: string;
  readonly notes?: string;
  readonly _hp?: string;
  readonly _ts?: string;
}
export interface SubmissionMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly locale: Locale;
  readonly now?: Date;
}
export type SubmitOutcome = { readonly kind: "created"; readonly id: string; readonly token: string; readonly emailSent: boolean } | { readonly kind: "discarded" };

const RATE_LIMIT = { window: 600, max: Number(process.env.BOOKING_RATE_LIMIT ?? 10) };
const ipHashOf = (ip: string | null) => (ip ? createHash("sha256").update(`polyweb:${ip}`).digest("hex").slice(0, 32) : null);

/** Créneau formaté pour l'humain, dans le fuseau de la ressource. */
export const formatSlot = (start: Date, end: Date, zone: string, locale: Locale) =>
  `${formatZoned(start, zone, locale, { dateStyle: "full", timeStyle: "short" })} – ${formatZoned(end, zone, locale, { timeStyle: "short" })}`;

export const submitGuestBooking = (tenant: PublicTenant, resource: Resource, raw: GuestSubmission, meta: SubmissionMeta) =>
  Effect.gen(function* () {
    const now = meta.now ?? new Date();
    const ipHash = ipHashOf(meta.ip);
    const rl = checkRateLimit(`booking:${tenant.organizationId ?? "platform"}:${ipHash ?? "anon"}`, RATE_LIMIT);
    if (!rl.allowed) return yield* new RateLimitedError({ retryAfterSeconds: Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)) });
    // Robots : pot de miel rempli ou formulaire soumis trop vite / jeton absent → succès simulé, rien n'est écrit.
    if ((raw._hp ?? "").trim() !== "" || !(yield* checkTimestampToken(raw._ts))) return { kind: "discarded" } satisfies SubmitOutcome as SubmitOutcome;

    const input = {
      customerName: raw.customerName ?? "", customerEmail: raw.customerEmail ?? "", customerPhone: raw.customerPhone ?? null,
      partySize: /^\d{1,4}$/.test(raw.partySize ?? "") ? Number(raw.partySize) : Number.NaN, notes: raw.notes ?? null,
    };
    // Toutes les erreurs de saisie d'un coup (champs + créneau manquant) avant la transaction.
    const fields: GuestField[] = yield* validateGuest(input, resource.capacity).pipe(Effect.as([] as GuestField[]), Effect.catchTag("InvalidGuestError", (e) => Effect.succeed([...e.fields])));
    if (!raw.startsAt) fields.push("slot");
    if (fields.length > 0) return yield* new InvalidGuestError({ fields });

    const { booking } = yield* bookingsService.createGuestBooking({ ...input, organizationId: tenant.organizationId, resourceId: resource.id, startsAt: raw.startsAt! }, now);
    const config = yield* AppConfig;
    const token = guestToken(config.signingSecret, booking.id);
    const mail = guestConfirmationEmail({
      locale: meta.locale, customerName: booking.customerName ?? "", resourceName: resource.name, partySize: booking.partySize,
      when: formatSlot(booking.startsAt, booking.endsAt, resource.timezone, meta.locale), manageUrl: `${config.siteUrl}${manageUrlPath(meta.locale, tenant, booking.id, token)}`,
    });
    const mailer = yield* Mailer;
    // Un échec d'envoi ne remet pas en cause la réservation (le lien est aussi affiché à l'écran).
    const sent = yield* mailer.send({ to: booking.customerEmail!, subject: mail.subject, html: mail.html, text: mail.text }).pipe(
      Effect.as(true), Effect.tapError((e) => Effect.logWarning("booking confirmation email failed", e)), Effect.catch(() => Effect.succeed(false)));
    yield* logAuditEventEffect({ action: "BOOKING_PUBLIC_CREATE", resource: "booking", resourceId: booking.id, metadata: { organizationId: tenant.organizationId, resourceId: resource.id, emailSent: sent }, ipAddress: meta.ip, userAgent: meta.userAgent });
    return { kind: "created", id: booking.id, token, emailSent: sent } satisfies SubmitOutcome as SubmitOutcome;
  });

/** Réservation du tenant si le jeton est valide ; `null` sinon (même réponse : pas d'oracle d'existence). */
export const guestBooking = (tenant: PublicTenant, id: string, token: string | null | undefined) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    if (!verifyGuestToken(config.signingSecret, id, token)) return null;
    return yield* bookingsLoader.booking(id, tenant.organizationId);
  });

/** Annulation par lien signé ; `null` si lien invalide. Échoue en BAD_REQUEST si non annulable. */
export const cancelGuestBooking = (tenant: PublicTenant, id: string, token: string | null | undefined, meta: { readonly ip: string | null; readonly userAgent: string | null; readonly now?: Date }) =>
  Effect.gen(function* () {
    const current = yield* guestBooking(tenant, id, token);
    if (!current) return null;
    const row = yield* bookingsService.cancelByGuest(current.id, meta.now);
    if (current.status !== "CANCELLED") {
      yield* logAuditEventEffect({ action: "BOOKING_PUBLIC_CANCEL", resource: "booking", resourceId: current.id, metadata: { organizationId: tenant.organizationId }, ipAddress: meta.ip, userAgent: meta.userAgent });
    }
    return row;
  });
