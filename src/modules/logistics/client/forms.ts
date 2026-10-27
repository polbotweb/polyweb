/**
 * Formulaires logistics (expédition, entrepôt, article, mouvement, transfert, suivi, inventaire) : lecture
 * des champs au format des actions puis appel de l'action `logistics.*` désignée par
 * `data-logistics-form`, puis redirection (fiche) ou rechargement.
 */
import { actions } from "astro:actions";
import { toast } from "@atoms/toast";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type ManualKind = "receipt" | "issue" | "adjustment";
type ActionResult = { error?: { message: string }; data?: unknown } | null;

const text = (form: ParentNode, name: string) => String(form.querySelector<Field>(`[name="${name}"]`)?.value ?? "").trim();
const nullable = (value: string) => (value === "" ? null : value);
const integer = (value: string) => (/^-?\d+$/.test(value) ? Number(value) : null);

/** Champ invalide : marqué `aria-invalid`, focalisé, soumission abandonnée. */
const invalid = (form: HTMLFormElement, selector: string): null => {
  const input = form.querySelector<HTMLElement>(selector);
  input?.setAttribute("aria-invalid", "true");
  input?.focus();
  return null;
};

/** Lignes `[data-line]` → `{ sku, description, quantity }` (lignes sans SKU ignorées). */
export function readShipmentLines(form: ParentNode) {
  return [...form.querySelectorAll<HTMLElement>("[data-line]")]
    .map((row) => ({ sku: text(row, "sku").toUpperCase(), description: nullable(text(row, "description")), quantity: integer(text(row, "quantity")) ?? 0 }))
    .filter((line) => line.sku !== "");
}

export function readShipmentForm(form: HTMLFormElement) {
  const weight = text(form, "weightGrams");
  return {
    title: nullable(text(form, "title")), warehouseId: text(form, "warehouseId"), salesDocumentId: nullable(text(form, "salesDocumentId")),
    recipientName: text(form, "recipientName"), address: nullable(text(form, "address")), country: text(form, "country").toUpperCase(),
    carrier: nullable(text(form, "carrier")), trackingNumber: nullable(text(form, "trackingNumber")),
    weightGrams: weight === "" ? null : integer(weight), notes: nullable(text(form, "notes")), lines: readShipmentLines(form),
  };
}

export const readWarehouseForm = (form: HTMLFormElement) => ({
  code: text(form, "code").toUpperCase(), name: text(form, "name"), country: nullable(text(form, "country").toUpperCase()),
  address: nullable(text(form, "address")), active: form.querySelector<HTMLInputElement>("[name=active]")?.checked ?? true,
});

export const readItemForm = (form: HTMLFormElement) => ({ sku: text(form, "sku").toUpperCase(), name: text(form, "name"), variantId: nullable(text(form, "variantId")) });

/** Saisies d'inventaire `[data-count-line]` → `{ lineId, counted }` (vide = non compté). */
export const readInventoryCounts = (form: ParentNode) =>
  [...form.querySelectorAll<HTMLInputElement>("input[data-count-line]")].map((input) => ({ lineId: input.dataset.countLine ?? "", counted: nullable(input.value.trim()) }));

const org = (form: HTMLFormElement) => form.dataset.organizationId || null;

/** Inventaire : enregistrer les comptages, puis (selon le bouton) valider ou annuler. */
async function submitInventory(form: HTMLFormElement, intent: string): Promise<ActionResult> {
  const id = form.dataset.id ?? "";
  if (intent === "cancel") return actions.logistics.cancelInventory({ id });
  const entries = readInventoryCounts(form);
  const invalidLine = entries.findIndex((entry) => entry.counted !== null && !/^\d{1,8}$/.test(entry.counted));
  if (invalidLine >= 0) return invalid(form, `input[data-count-line="${entries[invalidLine]!.lineId}"]`);
  if (entries.length > 0) {
    const saved = await actions.logistics.recordInventoryCounts({ id, entries });
    if (saved.error || intent !== "validate") return saved;
  }
  return actions.logistics.validateInventory({ id });
}

const submitters: Record<string, (form: HTMLFormElement, intent: string) => Promise<ActionResult>> = {
  shipment: async (form) => {
    const values = readShipmentForm(form);
    if (values.lines.length === 0) return invalid(form, "[data-line] [name=sku]");
    if (values.lines.some((line) => line.quantity < 1)) return invalid(form, "[data-line] [name=quantity]");
    const id = form.dataset.id ?? "";
    return id ? actions.logistics.update({ id, ...values }) : actions.logistics.create({ ...values, organizationId: org(form) });
  },
  warehouse: (form) => {
    const id = form.dataset.id ?? "";
    return id ? actions.logistics.updateWarehouse({ id, ...readWarehouseForm(form) }) : actions.logistics.createWarehouse({ ...readWarehouseForm(form), organizationId: org(form) });
  },
  item: (form) => {
    const id = form.dataset.id ?? "";
    return id ? actions.logistics.updateItem({ id, ...readItemForm(form) }) : actions.logistics.createItem({ ...readItemForm(form), organizationId: org(form) });
  },
  movement: async (form) => {
    const quantity = integer(text(form, "quantity"));
    if (!quantity) return invalid(form, "[name=quantity]");
    return actions.logistics.recordMovement({
      organizationId: org(form), warehouseId: text(form, "warehouseId"), sku: text(form, "sku").toUpperCase(),
      kind: (text(form, "kind") || "receipt") as ManualKind, quantity, reference: nullable(text(form, "reference")),
    });
  },
  transfer: async (form) => {
    const quantity = integer(text(form, "quantity"));
    if (!quantity || quantity < 1) return invalid(form, "[name=quantity]");
    return actions.logistics.transfer({
      organizationId: org(form), fromWarehouseId: text(form, "fromWarehouseId"), toWarehouseId: text(form, "toWarehouseId"),
      sku: text(form, "sku").toUpperCase(), quantity, reference: nullable(text(form, "reference")),
    });
  },
  inventory: (form) => actions.logistics.openInventory({ organizationId: org(form), warehouseId: text(form, "warehouseId"), note: nullable(text(form, "note")) }),
  inventoryCounts: submitInventory,
  tracking: (form) => actions.logistics.updateTracking({ id: form.dataset.id ?? "", carrier: nullable(text(form, "carrier")), trackingNumber: nullable(text(form, "trackingNumber")) }),
};

/** Ajout / retrait de lignes d'expédition (gabarit `template[data-line-template]`). */
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

export function initLogisticsForms(): void {
  document.querySelectorAll<HTMLFormElement>("form[data-logistics-form]:not([data-bound])").forEach((form) => {
    form.dataset.bound = "true";
    bindLines(form);
    const errorBox = form.querySelector<HTMLElement>("[data-form-error]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      // Bouton émetteur : intention (`value`), confirmation (`data-confirm`) et message (`data-done`) propres.
      const emitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
      const intent = emitter?.value ?? "";
      if (emitter?.dataset.confirm && !window.confirm(emitter.dataset.confirm)) return;
      if (errorBox) errorBox.hidden = true;
      form.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
      const buttons = [...form.querySelectorAll<HTMLButtonElement>("button[type=submit]")];
      buttons.forEach((button) => { button.disabled = true; });
      const result = await submitters[form.dataset.logisticsForm ?? ""]?.(form, intent);
      buttons.forEach((button) => { button.disabled = false; });
      if (!result) return;
      if (result.error) {
        if (errorBox) { errorBox.textContent = result.error.message; errorBox.hidden = false; errorBox.focus(); }
        return;
      }
      toast.success(emitter?.dataset.done ?? form.dataset.done ?? "");
      const { viewBaseUrl = "", id = "" } = form.dataset;
      const created = result.data && typeof result.data === "object" && "id" in result.data ? String(result.data.id) : "";
      window.location.assign(viewBaseUrl ? `${viewBaseUrl}/${id || created}` : window.location.pathname);
    });
  });
}
