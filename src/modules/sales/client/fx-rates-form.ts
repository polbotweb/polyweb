/**
 * Taux de change (back-office) : devise de tenue (`sales.setBaseCurrency`), ajout d'un forçage
 * manuel (`sales.setExchangeRate`) et suppression (`sales.deleteExchangeRate`). Erreurs dans la zone
 * `role="alert"` (focus), succès : toast puis rechargement de la liste.
 */
import { actions } from "astro:actions";
import { toast } from "@atoms/toast";

const RATE = /^\d{1,9}([.,]\d{1,12})?$/;

const errorHandler = (form: HTMLFormElement) => (message: string) => {
  const box = form.querySelector<HTMLElement>("[data-form-error]");
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
  box.focus();
};

const done = (message: string | undefined) => {
  toast.success(message ?? "");
  window.location.reload();
};

export function initFxRatesForms(): void {
  document.querySelectorAll<HTMLFormElement>("[data-fx-base-form]:not([data-bound])").forEach((form) => {
    form.dataset.bound = "true";
    const showError = errorHandler(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const baseCurrency = String(new FormData(form).get("baseCurrency") ?? "");
      const result = await actions.sales.setBaseCurrency({ organizationId: form.dataset.organizationId || null, baseCurrency });
      if (result.error) return showError(result.error.message);
      done(form.dataset.done);
    });
  });
  document.querySelectorAll<HTMLFormElement>("[data-fx-rate-form]:not([data-bound])").forEach((form) => {
    form.dataset.bound = "true";
    const showError = errorHandler(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const [from, to, date, rate] = ["from", "to", "date", "rate"].map((key) => String(data.get(key) ?? "").trim());
      const rateInput = form.querySelector<HTMLInputElement>("input[name=rate]");
      if (!RATE.test(rate!) || Number(rate!.replace(",", ".")) <= 0 || from === to || !/^\d{4}-\d{2}-\d{2}$/.test(date!)) {
        rateInput?.setAttribute("aria-invalid", "true");
        return showError(form.dataset.invalid ?? "");
      }
      rateInput?.removeAttribute("aria-invalid");
      const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
      if (submit) submit.disabled = true;
      const result = await actions.sales.setExchangeRate({ organizationId: form.dataset.organizationId || null, from: from!, to: to!, date: date!, rate: rate! });
      if (submit) submit.disabled = false;
      if (result.error) return showError(result.error.message);
      done(form.dataset.done);
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-fx-delete]:not([data-bound])").forEach((button) => {
    button.dataset.bound = "true";
    button.addEventListener("click", async () => {
      if (!window.confirm(button.dataset.confirm ?? "")) return;
      button.disabled = true;
      const result = await actions.sales.deleteExchangeRate({ organizationId: button.dataset.organizationId || null, id: button.dataset.fxDelete ?? "" });
      button.disabled = false;
      if (result.error) return void toast.error(result.error.message);
      done(button.dataset.done);
    });
  });
}
