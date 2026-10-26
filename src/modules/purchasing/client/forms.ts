/**
 * Formulaires purchasing (commande fournisseur, fournisseur, réception) : lecture des champs au
 * format des actions puis appel de l'action `purchasing.*` désignée par `data-purchasing-form`,
 * puis redirection (fiche) ou rechargement.
 */
import { actions } from "astro:actions";
import { toast } from "@atoms/toast";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type ActionResult = { error?: { message: string }; data?: unknown } | null;

const text = (form: ParentNode, name: string) => String(form.querySelector<Field>(`[name="${name}"]`)?.value ?? "").trim();
const nullable = (value: string) => (value === "" ? null : value);
const integer = (value: string) => (/^\d+$/.test(value) ? Number(value) : null);

/** Champ invalide : marqué `aria-invalid`, focalisé, soumission abandonnée. */
const invalid = (form: HTMLFormElement, selector: string): null => {
  const input = form.querySelector<HTMLElement>(selector);
  input?.setAttribute("aria-invalid", "true");
  input?.focus();
  return null;
};

/** Lignes `[data-line]` → `{ sku, description, quantity, unitPrice }` (lignes sans SKU ignorées). */
export function readOrderLines(form: ParentNode) {
  return [...form.querySelectorAll<HTMLElement>("[data-line]")]
    .map((row) => ({
      sku: text(row, "sku").toUpperCase(), description: nullable(text(row, "description")),
      quantity: integer(text(row, "quantity")) ?? 0, unitPrice: text(row, "unitPrice"),
    }))
    .filter((line) => line.sku !== "");
}

export function readOrderForm(form: HTMLFormElement) {
  return {
    title: nullable(text(form, "title")), supplierId: text(form, "supplierId"), warehouseId: text(form, "warehouseId"),
    currency: text(form, "currency").toUpperCase(), expectedDate: nullable(text(form, "expectedDate")), notes: nullable(text(form, "notes")),
    lines: readOrderLines(form),
  };
}

export const readSupplierForm = (form: HTMLFormElement) => ({
  code: text(form, "code").toUpperCase(), name: text(form, "name"), email: nullable(text(form, "email")),
  country: nullable(text(form, "country").toUpperCase()), vatNumber: nullable(text(form, "vatNumber")), address: nullable(text(form, "address")),
  paymentTermDays: integer(text(form, "paymentTermDays")) ?? 30, active: form.querySelector<HTMLInputElement>("[name=active]")?.checked ?? true,
});

/** Réception : une quantité par ligne `[data-receipt-line]` (0 = non reçue). */
export function readReceiptForm(form: HTMLFormElement) {
  return {
    supplierReference: nullable(text(form, "supplierReference")), notes: nullable(text(form, "notes")),
    lines: [...form.querySelectorAll<HTMLElement>("[data-receipt-line]")].map((row) => ({ lineId: row.dataset.lineId ?? "", quantity: integer(text(row, "quantity")) ?? -1 })),
  };
}

const org = (form: HTMLFormElement) => form.dataset.organizationId || null;

const submitters: Record<string, (form: HTMLFormElement) => Promise<ActionResult>> = {
  order: async (form) => {
    const values = readOrderForm(form);
    if (values.lines.length === 0) return invalid(form, "[data-line] [name=sku]");
    if (values.lines.some((line) => line.quantity < 1)) return invalid(form, "[data-line] [name=quantity]");
    if (values.lines.some((line) => line.unitPrice === "")) return invalid(form, "[data-line] [name=unitPrice]");
    const id = form.dataset.id ?? "";
    return id ? actions.purchasing.update({ id, ...values }) : actions.purchasing.create({ ...values, organizationId: org(form) });
  },
  supplier: (form) => {
    const id = form.dataset.id ?? "";
    return id ? actions.purchasing.updateSupplier({ id, ...readSupplierForm(form) }) : actions.purchasing.createSupplier({ ...readSupplierForm(form), organizationId: org(form) });
  },
  receipt: async (form) => {
    const values = readReceiptForm(form);
    const bad = values.lines.find((line) => line.quantity < 0);
    if (bad) return invalid(form, `[data-receipt-line][data-line-id="${bad.lineId}"] [name=quantity]`);
    if (!values.lines.some((line) => line.quantity > 0)) return invalid(form, "[data-receipt-line] [name=quantity]");
    return actions.purchasing.receive({ id: form.dataset.id ?? "", ...values });
  },
};

/** Ajout / retrait de lignes de commande (gabarit `template[data-line-template]`). */
function bindLines(form: HTMLFormElement): void {
  const container = form.querySelector<HTMLElement>("[data-lines]");
  const template = form.querySelector<HTMLTemplateElement>("template[data-line-template]");
  if (!container || !template) return;
  form.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-add-line]")) {
      container.append(template.content.cloneNode(true));
      container.querySelector<HTMLInputElement>("[data-line]:last-child [name=sku]")?.focus();
    }
    const remove = target.closest("[data-remove-line]");
    if (remove && container.querySelectorAll("[data-line]").length > 1) remove.closest("[data-line]")?.remove();
  });
}

export function initPurchasingForms(): void {
  document.querySelectorAll<HTMLFormElement>("form[data-purchasing-form]:not([data-bound])").forEach((form) => {
    form.dataset.bound = "true";
    bindLines(form);
    const errorBox = form.querySelector<HTMLElement>("[data-form-error]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (errorBox) errorBox.hidden = true;
      form.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
      const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
      if (submit) submit.disabled = true;
      const result = await submitters[form.dataset.purchasingForm ?? ""]?.(form);
      if (submit) submit.disabled = false;
      if (!result) return;
      if (result.error) {
        if (errorBox) { errorBox.textContent = result.error.message; errorBox.hidden = false; errorBox.focus(); }
        return;
      }
      toast.success(form.dataset.done ?? "");
      const { viewBaseUrl = "", id = "" } = form.dataset;
      const created = result.data && typeof result.data === "object" && "id" in result.data ? String(result.data.id) : "";
      window.location.assign(viewBaseUrl ? `${viewBaseUrl}/${id || created}` : window.location.pathname);
    });
  });
}
