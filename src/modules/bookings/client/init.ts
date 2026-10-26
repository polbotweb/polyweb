/**
 * Point d'entrée navigateur du domaine bookings. Les composants n'importent QUE ce fichier —
 * jamais `astro:actions` directement. Idempotent : premier rendu puis `astro:after-swap`.
 */
import { initBookingsForms } from "./forms";
import { initBookingsRecord } from "./record-actions";
import { initBookingsSlots } from "./slots";

export function initBookings(): void {
  initBookingsForms();
  initBookingsSlots();
  initBookingsRecord();
}
