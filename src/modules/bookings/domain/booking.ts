/**
 * Validation d'une réservation : créneau [début, fin) (5 min à 7 jours), client, effectif ≤ capacité,
 * respect des plages d'ouverture, absence de chevauchement avec les réservations actives.
 */
import { Effect } from "effect";
import { durationMinutes, overlaps, withinWindows, type Interval, type WeeklyWindow } from "@/core/scheduling";
import { BookingConflictError, InvalidBookingError, OutsideAvailabilityError } from "./errors";

export const MIN_MINUTES = 5;
export const MAX_MINUTES = 7 * 24 * 60;
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export interface BookingFields {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly customerName: string;
  readonly customerEmail: string | null;
  readonly partySize: number;
}

const parseInstant = (value: string) => {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
};

export const validateBooking = (input: BookingFields, capacity: number) =>
  Effect.gen(function* () {
    const start = parseInstant(input.startsAt);
    if (!start) return yield* new InvalidBookingError({ field: "startsAt", value: input.startsAt });
    const end = parseInstant(input.endsAt);
    if (!end) return yield* new InvalidBookingError({ field: "endsAt", value: input.endsAt });
    const minutes = durationMinutes({ start, end });
    if (end <= start || minutes < MIN_MINUTES || minutes > MAX_MINUTES) return yield* new InvalidBookingError({ field: "duration", value: `${input.startsAt} → ${input.endsAt}` });
    const customerName = input.customerName.trim();
    if (customerName === "" || customerName.length > 200) return yield* new InvalidBookingError({ field: "customerName", value: input.customerName });
    const customerEmail = input.customerEmail?.trim().toLowerCase() || null;
    if (customerEmail !== null && !isEmail(customerEmail)) return yield* new InvalidBookingError({ field: "customerEmail", value: input.customerEmail ?? "" });
    if (!Number.isSafeInteger(input.partySize) || input.partySize < 1 || input.partySize > capacity) return yield* new InvalidBookingError({ field: "partySize", value: String(input.partySize) });
    return { startsAt: start, endsAt: end, customerName, customerEmail, partySize: input.partySize };
  });

export interface SlotCheck {
  readonly resourceId: string;
  readonly timezone: string;
  readonly windows: readonly WeeklyWindow[];
  /** Réservations actives de la ressource (hors la réservation contrôlée). */
  readonly active: readonly (Interval & { readonly id: string })[];
}

/** Contrôle du créneau : plages d'ouverture puis chevauchement. */
export const checkSlot = (slot: Interval, check: SlotCheck) =>
  Effect.gen(function* () {
    if (!withinWindows(slot, check.windows, check.timezone)) {
      return yield* new OutsideAvailabilityError({ resourceId: check.resourceId, startsAt: slot.start.toISOString(), endsAt: slot.end.toISOString() });
    }
    const conflict = check.active.find((other) => overlaps(slot, other));
    if (conflict) return yield* new BookingConflictError({ resourceId: check.resourceId, conflictingId: conflict.id });
    return slot;
  });

export const bookingLabel = (b: { number: string | null; customerName: string }) => b.number ?? b.customerName;
