/**
 * Fiches CRM : boutons `data-crm-op` (transition d'étape, liaison de devis, suppression,
 * activité terminée / supprimée). Les erreurs d'action s'affichent dans `[data-crm-error]`.
 */
import { actions } from "astro:actions";

type Stage = "NEW" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";
type LostReason = "price" | "competitor" | "timing" | "no_budget" | "no_decision" | "other";

const showError = (root: HTMLElement, message: string) => {
  const box = root.querySelector<HTMLElement>("[data-crm-error]");
  if (box) { box.textContent = message; box.hidden = false; box.focus(); }
};

export function initCrmRecord(): void {
  document.querySelectorAll<HTMLElement>("[data-crm-record]:not([data-bound])").forEach((root) => {
    root.dataset.bound = "true";
    const { id = "", kind = "opportunity", listUrl = "" } = root.dataset;
    root.addEventListener("click", async (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-crm-op]");
      if (!button) return;
      if (!["transition", "link-quote", "unlink-quote", "activity-done", "activity-delete", "delete"].includes(button.dataset.crmOp ?? "")) return;
      const { crmOp, to = "", target = "", confirm: confirmText = "" } = button.dataset;
      if (confirmText && !window.confirm(confirmText)) return;
      const lostReason = (root.querySelector<HTMLSelectElement>("[name=lostReason]")?.value || null) as LostReason | null;
      const quoteId = root.querySelector<HTMLSelectElement>("[name=quoteId]")?.value || null;
      button.disabled = true;
      const result =
        crmOp === "transition" ? await actions.crm.transition({ id, to: to as Stage, lostReason: to === "LOST" ? lostReason : null })
          : crmOp === "link-quote" ? await actions.crm.linkQuote({ id, quoteId })
            : crmOp === "unlink-quote" ? await actions.crm.linkQuote({ id, quoteId: null })
              : crmOp === "activity-done" ? await actions.crm.completeActivity({ id: target, done: button.dataset.done !== "true" })
                : crmOp === "activity-delete" ? await actions.crm.deleteActivity({ id: target })
                  : kind === "company" ? await actions.crm.deleteCompany({ id })
                    : kind === "contact" ? await actions.crm.deleteContact({ id })
                      : await actions.crm.delete({ id });
      button.disabled = false;
      if (result.error) return showError(root, result.error.message);
      window.location.assign(crmOp === "delete" ? listUrl : window.location.pathname);
    });
  });
}
