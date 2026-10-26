/** Numérotation des réservations (core/numbering) : à la confirmation, sans trou, remise annuelle. */
import type { NumberingScheme } from "@/core/numbering";

export const BOOKING_NUMBERING_KEY = "bookings.booking";
export const DEFAULT_BOOKING_NUMBERING: NumberingScheme = { pattern: "{prefix}-{YYYY}-{seq:5}", reset: "yearly", prefix: "RES" };
