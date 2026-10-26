/**
 * Fiche d'un document de vente : boutons de transition, conversion du devis, avoir,
 * relance et formulaire d'encaissement. Chaque bouton porte `data-sales-op` ; le résultat
 * recharge la fiche (ou ouvre le document créé). Les erreurs d'action s'affichent dans `[data-sales-error]`.
 */
import { actions } from "astro:actions";
import { toast } from "@atoms/toast";
import { priceToMinor } from "./document-form";

type Status = "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "ISSUED" | "CANCELLED";
type Method = "bank_transfer" | "card" | "cash" | "check" | "direct_debit" | "other";

const showError = (root: HTMLElement, message: string) => {
  const box = root.querySelector<HTMLElement>("[data-sales-error]");
  if (box) { box.textContent = message; box.hidden = false; }
};

export function initSalesDocument(): void {
  document.querySelectorAll<HTMLElement>("[data-sales-document]:not([data-bound])").forEach((root) => {
    root.dataset.bound = "true";
    const { id = "", viewBaseUrl = "", currency = "EUR" } = root.dataset;
    root.querySelectorAll<HTMLButtonElement>("[data-sales-op]").forEach((button) => {
      button.addEventListener("click", async () => {
        const { salesOp, to = "", confirm: confirmText = "" } = button.dataset;
        if (confirmText && !window.confirm(confirmText)) return;
        button.disabled = true;
        const result = salesOp === "transition" ? await actions.sales.transition({ id, to: to as Status })
          : salesOp === "convert" ? await actions.sales.convertQuote({ id })
          : salesOp === "credit-note" ? await actions.sales.createCreditNote({ id })
          : await actions.sales.recordReminder({ id });
        button.disabled = false;
        if (result.error) return showError(root, result.error.message);
        if (salesOp === "remind") {
          toast.success(result.data ? (button.dataset.done ?? "") : (button.dataset.none ?? ""));
          if (!result.data) return;
        }
        const created = (salesOp === "convert" || salesOp === "credit-note") && result.data && "id" in result.data ? String(result.data.id) : id;
        window.location.assign(`${viewBaseUrl}/${created}`);
      });
    });
    root.querySelector<HTMLFormElement>("[data-sales-payment-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const data = new FormData(form);
      const amountInput = form.querySelector<HTMLInputElement>("[name=amount]");
      const amountMinor = priceToMinor(String(data.get("amount") ?? ""), currency);
      if (!amountMinor) { amountInput?.setAttribute("aria-invalid", "true"); amountInput?.focus(); return; }
      const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
      if (submit) submit.disabled = true;
      const reference = String(data.get("reference") ?? "").trim();
      const result = await actions.sales.recordPayment({ id, amountMinor, method: String(data.get("method") ?? "bank_transfer") as Method, paidAt: String(data.get("paidAt") ?? ""), reference: reference || null });
      if (submit) submit.disabled = false;
      if (result.error) return showError(root, result.error.message);
      window.location.assign(`${viewBaseUrl}/${id}`);
    });
  });
}
