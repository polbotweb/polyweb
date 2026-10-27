/**
 * Cycle de vie d'une réservation (core/workflow) :
 *
 *   REQUESTED → CONFIRMED → CHECKED_IN → COMPLETED
 *
 * Retour possible CONFIRMED → REQUESTED ; annulation depuis REQUESTED ou CONFIRMED ;
 * absence (NO_SHOW) depuis CONFIRMED ; expiration (EXPIRED) d'une demande dont l'acompte
 * n'a pas été payé à temps (core/payments). Le numéro de réservation est attribué à la confirmation.
 * Les statuts « actifs » occupent le créneau (contrôle de chevauchement).
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const BOOKING_STATUSES = ["REQUESTED", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const ACTIVE_STATUSES: readonly BookingStatus[] = ["REQUESTED", "CONFIRMED", "CHECKED_IN"];
export const EDITABLE_STATUSES: readonly BookingStatus[] = ["REQUESTED", "CONFIRMED"];
export const FINAL_STATUSES: readonly BookingStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED"];

export const bookingWorkflow: WorkflowDefinition<BookingStatus> = {
  states: BOOKING_STATUSES,
  transitions: [
    { from: "REQUESTED", to: "CONFIRMED" },
    { from: "CONFIRMED", to: "REQUESTED" },
    { from: "REQUESTED", to: "CANCELLED" },
    { from: "REQUESTED", to: "EXPIRED" },
    { from: "CONFIRMED", to: "CANCELLED" },
    { from: "CONFIRMED", to: "CHECKED_IN" },
    { from: "CONFIRMED", to: "NO_SHOW" },
    { from: "CHECKED_IN", to: "COMPLETED" },
  ],
};

export const isActive = (status: BookingStatus) => ACTIVE_STATUSES.includes(status);
export const isEditable = (status: BookingStatus) => EDITABLE_STATUSES.includes(status);

/** Transitions proposées depuis `from`, dans l'ordre du cycle. */
export const nextStatuses = (from: BookingStatus): readonly BookingStatus[] =>
  BOOKING_STATUSES.filter((to) => bookingWorkflow.transitions.some((t) => t.from === from && t.to === to));

/** Numéro attribué à la confirmation (sans trou, `core/numbering`). */
export const assignsNumber = (from: BookingStatus, to: BookingStatus) => from === "REQUESTED" && to === "CONFIRMED";

/** Une transition vers un statut actif depuis un statut inactif doit revérifier le créneau. */
export const reoccupiesSlot = (from: BookingStatus, to: BookingStatus) => !isActive(from) && isActive(to);
