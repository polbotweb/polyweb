/**
 * Fiches logistics : boutons `data-logistics-op` (transition de statut, suppression d'une
 * expédition, d'un entrepôt ou d'un article). Les erreurs s'affichent dans `[data-logistics-error]`.
 */
import { actions } from "astro:actions";

type Status = "DRAFT" | "READY" | "SHIPPED" | "DELIVERED" | "RETURNED" | "CANCELLED";

const showError = (root: HTMLElement, message: string) => {
  const box = root.querySelector<HTMLElement>("[data-logistics-error]");
  if (box) { box.textContent = message; box.hidden = false; box.focus(); }
};

export function initLogisticsRecord(): void {
  document.querySelectorAll<HTMLElement>("[data-logistics-record]:not([data-bound])").forEach((root) => {
    root.dataset.bound = "true";
    const { id = "", kind = "shipment", listUrl = "" } = root.dataset;
    root.addEventListener("click", async (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-logistics-op]");
      if (!button) return;
      const { logisticsOp, to = "", confirm: confirmText = "" } = button.dataset;
      if (logisticsOp !== "transition" && logisticsOp !== "delete") return;
      if (confirmText && !window.confirm(confirmText)) return;
      button.disabled = true;
      const result =
        logisticsOp === "transition" ? await actions.logistics.transition({ id, to: to as Status })
          : kind === "warehouse" ? await actions.logistics.deleteWarehouse({ id })
            : kind === "item" ? await actions.logistics.deleteItem({ id })
              : await actions.logistics.delete({ id });
      button.disabled = false;
      if (result.error) return showError(root, result.error.message);
      window.location.assign(logisticsOp === "delete" ? listUrl : window.location.pathname);
    });
  });
}
