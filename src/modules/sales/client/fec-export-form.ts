/**
 * Génération manuelle d'un export FEC : lit la période (`<input type="month">`), appelle
 * `sales.generateFecExport`, affiche l'erreur (zone `role="alert"`, focus) ou, si l'export a
 * échoué côté génération, son motif ; sinon recharge la liste.
 */
import { actions } from "astro:actions";
import { toast } from "@atoms/toast";

export function initFecExportForm(): void {
  document.querySelectorAll<HTMLFormElement>("[data-fec-export-form]:not([data-bound])").forEach((form) => {
    form.dataset.bound = "true";
    const errorBox = form.querySelector<HTMLElement>("[data-form-error]");
    const showError = (message: string) => {
      if (!errorBox) return;
      errorBox.textContent = message;
      errorBox.hidden = false;
      errorBox.focus();
    };
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const period = String(new FormData(form).get("period") ?? "").trim();
      const input = form.querySelector<HTMLInputElement>("input[name=period]");
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
        input?.setAttribute("aria-invalid", "true");
        return showError(form.dataset.invalid ?? "");
      }
      input?.removeAttribute("aria-invalid");
      const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
      if (submit) submit.disabled = true;
      if (errorBox) errorBox.hidden = true;
      const result = await actions.sales.generateFecExport({ period, organizationId: form.dataset.organizationId || null });
      if (submit) submit.disabled = false;
      if (result.error) return showError(result.error.message);
      if (result.data.status === "FAILED") return showError(`${form.dataset.failed ?? ""} ${result.data.error ?? ""}`.trim());
      toast.success(form.dataset.done ?? "");
      window.location.reload();
    });
  });
}
