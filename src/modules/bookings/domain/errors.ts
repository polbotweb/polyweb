import { Data } from "effect";

export class InvalidResourceError extends Data.TaggedError("InvalidResourceError")<{ readonly field: "code" | "name" | "kind" | "capacity" | "timezone" | "slotMinutes" | "windows"; readonly value: string }> {
  override get message() {
    return `Ressource invalide (${this.field}) : ${this.value}`;
  }
}

export class InvalidBookingError extends Data.TaggedError("InvalidBookingError")<{ readonly field: "startsAt" | "endsAt" | "duration" | "customerName" | "customerEmail" | "partySize"; readonly value: string }> {
  override get message() {
    return `Réservation invalide (${this.field}) : ${this.value}`;
  }
}

/** Créneau hors des plages d'ouverture de la ressource. */
export class OutsideAvailabilityError extends Data.TaggedError("OutsideAvailabilityError")<{ readonly resourceId: string; readonly startsAt: string; readonly endsAt: string }> {
  override get message() {
    return `Créneau hors des plages d'ouverture : ${this.startsAt} → ${this.endsAt}`;
  }
}

/** Chevauchement avec une réservation active de la même ressource. */
export class BookingConflictError extends Data.TaggedError("BookingConflictError")<{ readonly resourceId: string; readonly conflictingId: string }> {
  override get message() {
    return `Créneau déjà réservé (${this.conflictingId})`;
  }
}
