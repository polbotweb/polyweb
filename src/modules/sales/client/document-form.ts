/**
 * Formulaire de document de vente : éditeur de lignes (ajout / suppression), lecture des
 * champs au format des actions (prix saisis en unités majeures → unités mineures via
 * core/money), appel de `sales.create` / `sales.update`, puis redirection vers la fiche.
 */
import { actions } from "astro:actions";
import { Exit, Effect } from "effect";
import { toast } from "@atoms/toast";
import { fromDecimal, isCurrencyCode } from "@/core/money";

type TaxCategory = "standard" | "reduced" | "reduced-2" | "super-reduced" | "zero" | "exempt";

const field = (root: ParentNode, name: string) => root.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`);
const text = (root: ParentNode, name: string) => String(field(root, name)?.value ?? "").trim();
const nullable = (value: string) => (value === "" ? null : value);

/** Prix saisi (« 12,5 ») → unités mineures, ou `null` si la saisie / la devise est invalide. */
export function priceToMinor(input: string, currency: string): number | null {
  const code = currency.trim().toUpperCase();
  if (!isCurrencyCode(code)) return null;
  const exit = Effect.runSyncExit(fromDecimal(input.trim().replace(",", "."), code));
  return Exit.isSuccess(exit) && exit.value.amountMinor >= 0 ? exit.value.amountMinor : null;
}

export class SalesFormInputError extends Error {}

/** Valeurs du formulaire au format des actions ; lève `SalesFormInputError` sur un prix illisible. */
export function readSalesDocumentForm(form: HTMLFormElement) {
  const currency = text(form, "currency").toUpperCase();
  const lines = [...form.querySelectorAll<HTMLElement>("[data-sales-line]")].map((row) => {
    const unitPriceMinor = priceToMinor(text(row, "lineUnitPrice"), currency);
    if (unitPriceMinor === null) throw new SalesFormInputError(field(row, "lineUnitPrice")?.id ?? "");
    return { description: text(row, "lineDescription"), quantity: text(row, "lineQuantity"), unitPriceMinor, discountPercent: text(row, "lineDiscount") || "0", taxCategory: (text(row, "lineTaxCategory") || "standard") as TaxCategory };
  });
  const term = text(form, "paymentTermDays");
  return {
    title: text(form, "title"),
    customerName: text(form, "customerName"),
    customerEmail: nullable(text(form, "customerEmail")),
    customerAddress: nullable(text(form, "customerAddress")),
    customerCountry: text(form, "customerCountry"),
    customerType: (text(form, "customerType") === "B2C" ? "B2C" : "B2B") as "B2B" | "B2C",
    customerVatNumber: nullable(text(form, "customerVatNumber")),
    sellerCountry: text(form, "sellerCountry"),
    supplyType: (text(form, "supplyType") === "goods" ? "goods" : "services") as "goods" | "services",
    ossRegistered: (field(form, "ossRegistered") as HTMLInputElement | null)?.checked ?? false,
    currency,
    validUntil: nullable(text(form, "validUntil")),
    paymentTermDays: term === "" ? 30 : Number(term),
    notes: nullable(text(form, "notes")),
    lines,
  };
}

/** Renumérote les identifiants / `for` des lignes après ajout ou suppression (labels a11y uniques). */
function renumber(list: HTMLElement) {
  list.querySelectorAll<HTMLElement>("[data-sales-line]").forEach((row, index) => {
    row.querySelectorAll<HTMLElement>("[id^=line-]").forEach((element) => {
      const next = element.id.replace(/^line-\d+-/, `line-${index}-`);
      row.querySelector<HTMLLabelElement>(`label[for="${element.id}"]`)?.setAttribute("for", next);
      element.id = next;
    });
  });
}

export function initSalesDocumentForm(): void {
  document.querySelectorAll<HTMLFormElement>("[data-sales-document-form]:not([data-bound])").forEach((form) => {
    form.dataset.bound = "true";
    const list = form.querySelector<HTMLElement>("[data-sales-lines]");
    const errorBox = form.querySelector<HTMLElement>("[data-form-error]");
    form.querySelector("[data-sales-line-add]")?.addEventListener("click", () => {
      const last = list?.querySelector<HTMLElement>("[data-sales-line]:last-of-type");
      if (!list || !last) return;
      const clone = last.cloneNode(true) as HTMLElement;
      clone.querySelectorAll<HTMLInputElement>("input").forEach((input) => { input.value = input.name === "lineQuantity" ? "1" : input.name === "lineDiscount" ? "0" : ""; });
      list.append(clone);
      renumber(list);
      clone.querySelector<HTMLInputElement>("input")?.focus();
    });
    list?.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest("[data-sales-line-remove]");
      if (!button || list.querySelectorAll("[data-sales-line]").length <= 1) return;
      button.closest("[data-sales-line]")?.remove();
      renumber(list);
      form.querySelector<HTMLElement>("[data-sales-line-add]")?.focus();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (errorBox) errorBox.hidden = true;
      const { mode = "create", id = "", kind = "invoice", organizationId = "", viewBaseUrl = "", done = "" } = form.dataset;
      let values: ReturnType<typeof readSalesDocumentForm>;
      try {
        values = readSalesDocumentForm(form);
      } catch (error) {
        if (!(error instanceof SalesFormInputError)) throw error;
        const input = error.message ? form.querySelector<HTMLInputElement>(`#${CSS.escape(error.message)}`) : null;
        input?.setAttribute("aria-invalid", "true");
        input?.focus();
        return;
      }
      const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
      if (submit) submit.disabled = true;
      const result = mode === "update"
        ? await actions.sales.update({ id, ...values })
        : await actions.sales.create({ ...values, kind: kind === "quote" ? "quote" : "invoice", organizationId: organizationId || null });
      if (submit) submit.disabled = false;
      if (result.error) {
        if (errorBox) { errorBox.textContent = result.error.message; errorBox.hidden = false; }
        return;
      }
      toast.success(done);
      window.location.assign(`${viewBaseUrl}/${mode === "update" ? id : result.data?.id ?? ""}`);
    });
  });
}
