/**
 * Parcours public (visiteur) : validation des coordonnées, horizon de réservation et jeton signé
 * de gestion (consultation / annulation). Pur : le secret est fourni par l'appelant (AppConfig).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { Data, Effect } from "effect";

/** Réservable au plus tard N jours à l'avance (date locale de la ressource). */
export const BOOKING_HORIZON_DAYS = 180;

export type GuestField = "customerName" | "customerEmail" | "customerPhone" | "partySize" | "notes" | "slot";

export class InvalidGuestError extends Data.TaggedError("InvalidGuestError")<{ readonly fields: readonly GuestField[] }> {
  override get message() {
    return `Champs invalides : ${this.fields.join(", ")}`;
  }
}

export interface GuestInput {
  readonly customerName: string;
  readonly customerEmail: string;
  readonly customerPhone?: string | null;
  readonly partySize: number;
  readonly notes?: string | null;
}

export interface ValidGuest {
  readonly customerName: string;
  readonly customerEmail: string;
  readonly customerPhone: string | null;
  readonly partySize: number;
  readonly notes: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ().-]{6,30}$/;
// Caractères de contrôle (retours à la ligne compris) interdits dans les champs d'une ligne.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Toutes les erreurs d'un coup (affichage par champ). */
export const validateGuest = (input: GuestInput, capacity: number) =>
  Effect.gen(function* () {
    const customerName = input.customerName.trim();
    const customerEmail = input.customerEmail.trim().toLowerCase();
    const customerPhone = input.customerPhone?.trim() || null;
    const notes = input.notes?.trim() || null;
    const fields: GuestField[] = [];
    if (customerName.length < 2 || customerName.length > 120 || CONTROL.test(customerName)) fields.push("customerName");
    if (customerEmail.length > 254 || !EMAIL.test(customerEmail)) fields.push("customerEmail");
    if (customerPhone !== null && !PHONE.test(customerPhone)) fields.push("customerPhone");
    if (!Number.isSafeInteger(input.partySize) || input.partySize < 1 || input.partySize > capacity) fields.push("partySize");
    if (notes !== null && notes.length > 1000) fields.push("notes");
    if (fields.length > 0) return yield* new InvalidGuestError({ fields });
    return { customerName, customerEmail, customerPhone, partySize: input.partySize, notes } satisfies ValidGuest;
  });

/** Date ISO `YYYY-MM-DD` + n jours. */
export const addIsoDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Date réservable : valide, pas avant `today`, pas au-delà de l'horizon. */
export const isBookableDate = (date: string, today: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && addIsoDays(date, 0) === date && date >= today && date <= addIsoDays(today, BOOKING_HORIZON_DAYS);

// ─── Jeton de gestion ────────────────────────────────────────────────
const mac = (secret: string, bookingId: string) => createHmac("sha256", `polyweb:booking-guest:${secret}`).update(bookingId).digest("base64url").slice(0, 32);

/** Jeton signé (HMAC-SHA256 tronqué, 192 bits) lié à l'identifiant de la réservation. */
export const guestToken = (secret: string, bookingId: string) => mac(secret, bookingId);

/** Comparaison à temps constant. */
export const verifyGuestToken = (secret: string, bookingId: string, token: string | null | undefined) => {
  if (!token || token.length !== 32) return false;
  const expected = Buffer.from(mac(secret, bookingId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
};
