/**
 * Formulaire de taux de TVA : lit les champs, appelle `tax.create` / `tax.update`
 * (+ `tax.transition` si le statut change), affiche l'erreur d'action ou redirige vers la liste.
 */
import { actions } from "astro:actions";
import { toast } from "@atoms/toast";

type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type Category = "standard" | "reduced" | "reduced-2" | "super-reduced" | "zero" | "exempt";

const text = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? "").trim();
const nullable = (value: string) => (value === "" ? null : value);

/** Valeurs du formulaire au format des actions. */
export function readTaxRateForm(form: HTMLFormElement) {
  const customerType = text(form, "customerType");
  return {
    title: text(form, "title"),
    slug: text(form, "slug"),
    countryCode: text(form, "countryCode"),
    category: (text(form, "category") || "standard") as Category,
    customerType: customerType === "B2B" || customerType === "B2C" ? (customerType as "B2B" | "B2C") : null,
    ratePercent: text(form, "ratePercent"),
    validFrom: nullable(text(form, "validFrom")),
    validTo: nullable(text(form, "validTo")),
    status: (nullable(text(form, "status")) ?? undefined) as Status | undefined,
  };
}

export function initTaxRateForm(): void {
  document.querySelectorAll<HTMLFormElement>("[data-tax-rate-form]:not([data-bound])").forEach((form) => {
    form.dataset.bound = "true";
    const errorBox = form.querySelector<HTMLElement>("[data-form-error]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
      if (submit) submit.disabled = true;
      if (errorBox) errorBox.hidden = true;
      const { status, ...values } = readTaxRateForm(form);
      const { mode = "create", id = "", organizationId = "", listUrl = "", done = "", status: currentStatus = "" } = form.dataset;
      const result = mode === "update"
        ? await actions.tax.update({ id, ...values })
        : await actions.tax.create({ ...values, organizationId: organizationId || null });
      let error = result.error;
      const rowId = mode === "update" ? id : result.data?.id;
      if (!error && status && rowId && status !== (currentStatus || "DRAFT")) error = (await actions.tax.transition({ id: rowId, to: status })).error;
      if (submit) submit.disabled = false;
      if (error) {
        if (errorBox) { errorBox.textContent = error.message; errorBox.hidden = false; }
        return;
      }
      toast.success(done);
      window.location.assign(listUrl);
    });
  });
}
