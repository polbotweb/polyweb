/**
 * Fiches bookings : boutons `data-bookings-op` (transition de statut, suppression d'une
 * réservation ou d'une ressource). Les erreurs s'affichent dans `[data-bookings-error]`.
 */
import { actions } from "astro:actions";

type Status = "REQUESTED" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | "EXPIRED";

const showError = (root: HTMLElement, message: string) => {
  const box = root.querySelector<HTMLElement>("[data-bookings-error]");
  if (box) { box.textContent = message; box.hidden = false; box.focus(); }
};

export function initBookingsRecord(): void {
  document.querySelectorAll<HTMLElement>("[data-bookings-record]:not([data-bound])").forEach((root) => {
    root.dataset.bound = "true";
    const { id = "", kind = "booking", listUrl = "" } = root.dataset;
    root.addEventListener("click", async (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-bookings-op]");
      if (!button) return;
      const { bookingsOp, to = "", confirm: confirmText = "" } = button.dataset;
      if (bookingsOp !== "transition" && bookingsOp !== "delete") return;
      if (confirmText && !window.confirm(confirmText)) return;
      button.disabled = true;
      const result =
        bookingsOp === "transition" ? await actions.bookings.transition({ id, to: to as Status })
          : kind === "resource" ? await actions.bookings.deleteResource({ id })
            : await actions.bookings.delete({ id });
      button.disabled = false;
      if (result.error) return showError(root, result.error.message);
      window.location.assign(bookingsOp === "delete" ? listUrl : window.location.pathname);
    });
  });
}
