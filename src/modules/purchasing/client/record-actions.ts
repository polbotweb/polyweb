/**
 * Fiches purchasing : boutons `data-purchasing-op` (transition de statut, suppression d'une
 * commande ou d'un fournisseur). Les erreurs s'affichent dans `[data-purchasing-error]`.
 */
import { actions } from "astro:actions";

type Status = "DRAFT" | "SENT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CLOSED" | "CANCELLED";

const showError = (root: HTMLElement, message: string) => {
  const box = root.querySelector<HTMLElement>("[data-purchasing-error]");
  if (box) { box.textContent = message; box.hidden = false; box.focus(); }
};

export function initPurchasingRecord(): void {
  document.querySelectorAll<HTMLElement>("[data-purchasing-record]:not([data-bound])").forEach((root) => {
    root.dataset.bound = "true";
    const { id = "", kind = "order", listUrl = "" } = root.dataset;
    root.addEventListener("click", async (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-purchasing-op]");
      if (!button) return;
      const { purchasingOp, to = "", confirm: confirmText = "" } = button.dataset;
      if (purchasingOp !== "transition" && purchasingOp !== "delete") return;
      if (confirmText && !window.confirm(confirmText)) return;
      button.disabled = true;
      const result =
        purchasingOp === "transition" ? await actions.purchasing.transition({ id, to: to as Status })
          : kind === "supplier" ? await actions.purchasing.deleteSupplier({ id })
            : await actions.purchasing.delete({ id });
      button.disabled = false;
      if (result.error) return showError(root, result.error.message);
      window.location.assign(purchasingOp === "delete" ? listUrl : window.location.pathname);
    });
  });
}
