/**
 * Formulaire du profil vendeur : lit les champs, appelle `sales.saveSellerProfile`, affiche
 * l'erreur d'action (zone `role="alert"`, focus) ou confirme par un toast.
 */
import { actions } from "astro:actions";
import { toast } from "@atoms/toast";

const FIELDS = ["legalName", "vatNumber", "legalId", "legalIdScheme", "addressLine1", "addressLine2", "postcode", "city", "country", "email", "iban", "bic"] as const;

export function readSellerProfileForm(form: HTMLFormElement) {
  const data = new FormData(form);
  const value = (name: string) => String(data.get(name) ?? "").trim();
  const nullable = (name: string) => value(name) || null;
  const entries = Object.fromEntries(FIELDS.map((name) => [name, nullable(name)])) as Record<(typeof FIELDS)[number], string | null>;
  return { ...entries, legalName: value("legalName"), country: value("country") };
}

export function initSellerProfileForm(): void {
  document.querySelectorAll<HTMLFormElement>("[data-seller-profile-form]:not([data-bound])").forEach((form) => {
    form.dataset.bound = "true";
    const errorBox = form.querySelector<HTMLElement>("[data-form-error]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
      if (submit) submit.disabled = true;
      if (errorBox) errorBox.hidden = true;
      const result = await actions.sales.saveSellerProfile({ ...readSellerProfileForm(form), organizationId: form.dataset.organizationId || null });
      if (submit) submit.disabled = false;
      if (result.error) {
        if (errorBox) { errorBox.textContent = result.error.message; errorBox.hidden = false; errorBox.focus(); }
        return;
      }
      toast.success(form.dataset.done ?? "");
    });
  });
}
