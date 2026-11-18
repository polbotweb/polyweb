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

/** Lignes `[data-line]` : stock (SKU requis) ou prestation (description requise). */
export function readOrderLines(form: ParentNode) {
  return [...form.querySelectorAll<HTMLElement>("[data-line]")]
    .map((row) => ({
      kind: (text(row, "kind") || "stock") as "stock" | "service",
      sku: text(row, "sku").toUpperCase(),
      description: nullable(text(row, "description")),
      quantity: integer(text(row, "quantity")) ?? 0,
      unitPrice: text(row, "unitPrice"),
      warehouseId: nullable(text(row, "warehouseId")),
    }))
    .filter((line) => line.kind === "service" ? line.description !== null : line.sku !== "");
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
  iban: nullable(text(form, "iban")), bic: nullable(text(form, "bic")), sepaName: nullable(text(form, "sepaName")),
  crmCompanyId: nullable(text(form, "crmCompanyId")), crmContactId: nullable(text(form, "crmContactId")),
  trustedCatalogue: form.querySelector<HTMLInputElement>("[name=trustedCatalogue]")?.checked ?? false,
  punchoutEnabled: form.querySelector<HTMLInputElement>("[name=punchoutEnabled]")?.checked ?? false,
  punchoutSetupUrl: nullable(text(form, "punchoutSetupUrl")),
  punchoutIdentity: nullable(text(form, "punchoutIdentity")),
  punchoutDomain: nullable(text(form, "punchoutDomain")),
  punchoutSecret: nullable(text(form, "punchoutSecret")),
});

/** Réception : une quantité par ligne `[data-receipt-line]` (0 = non reçue). */
export function readReceiptForm(form: HTMLFormElement) {
  return {
    supplierReference: nullable(text(form, "supplierReference")), notes: nullable(text(form, "notes")),
    lines: [...form.querySelectorAll<HTMLElement>("[data-receipt-line]")].map((row) => ({ lineId: row.dataset.lineId ?? "", quantity: integer(text(row, "quantity")) ?? -1 })),
  };
}


const checked = (form: HTMLFormElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked ?? false;
const numberField = (form: HTMLFormElement, name: string) => Number(text(form, name));

export function readInvoiceLines(form: ParentNode) {
  return [...form.querySelectorAll<HTMLElement>("[data-invoice-line]")]
    .map((row) => ({
      description: text(row, "description"),
      quantity: integer(text(row, "quantity")) ?? 0,
      unitPrice: text(row, "unitPrice"),
      ratePercent: text(row, "ratePercent") || "20",
      sku: nullable(text(row, "sku")),
      orderLineId: nullable(text(row, "orderLineId")),
    }))
    .filter((line) => line.description !== "");
}

const org = (form: HTMLFormElement) => form.dataset.organizationId || null;

const submitters: Record<string, (form: HTMLFormElement) => Promise<ActionResult>> = {
  order: async (form) => {
    const values = readOrderForm(form);
    if (values.lines.length === 0) return invalid(form, "[data-line] [name=sku], [data-line] [name=description]");
    if (values.lines.some((line) => line.kind === "stock" && line.sku === "")) return invalid(form, "[data-line] [name=sku]");
    if (values.lines.some((line) => line.kind === "service" && !line.description)) return invalid(form, "[data-line] [name=description]");
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
  settings: (form) => actions.purchasing.saveSettings({
    organizationId: org(form),
    reorderMode: text(form, "reorderMode") as "off" | "suggestions" | "auto_draft" | "auto_send",
    reorderHour: numberField(form, "reorderHour"),
    reorderIncludeReservations: checked(form, "reorderIncludeReservations"),
    reorderAutoSendTrustedOnly: checked(form, "reorderAutoSendTrustedOnly"),
    matchingMode: text(form, "matchingMode") as "two_way" | "three_way",
    matchingPolicy: text(form, "matchingPolicy") as "block" | "allow_with_acceptance",
    toleranceAbsoluteMinor: numberField(form, "toleranceAbsoluteMinor"),
    tolerancePercent: numberField(form, "tolerancePercent"),
    approvalMode: text(form, "approvalMode") as "none" | "single_threshold" | "bands",
    approvalThresholdMinor: numberField(form, "approvalThresholdMinor"),
    defaultCurrency: text(form, "defaultCurrency").toUpperCase(),
    defaultPaymentTermDays: numberField(form, "defaultPaymentTermDays"),
    defaultTaxCategory: text(form, "defaultTaxCategory"),
    allowServiceLines: checked(form, "allowServiceLines"),
    allowMultiWarehouse: checked(form, "allowMultiWarehouse"),
    qualityControlRequired: checked(form, "qualityControlRequired"),
    poPrefix: text(form, "poPrefix").toUpperCase(),
    receiptPrefix: text(form, "receiptPrefix").toUpperCase(),
    invoicePrefix: text(form, "invoicePrefix").toUpperCase(),
    creditPrefix: text(form, "creditPrefix").toUpperCase(),
    returnPrefix: text(form, "returnPrefix").toUpperCase(),
    sepaPrefix: text(form, "sepaPrefix").toUpperCase(),
    debtorName: nullable(text(form, "debtorName")),
    debtorIban: nullable(text(form, "debtorIban")),
    debtorBic: nullable(text(form, "debtorBic")),
    approvalBands: [...form.querySelectorAll<HTMLElement>("[data-approval-band]")].map((row) => ({
      level: integer(text(row, "bandLevel")) ?? 0,
      minMinor: integer(text(row, "bandMinMinor")) ?? 0,
      maxMinor: integer(text(row, "bandMaxMinor")),
      requiredRole: (text(row, "bandRole") || "orgAdmin") as "orgMember" | "orgAdmin" | "orgOwner" | "admin" | "any",
      requiredPermission: nullable(text(row, "bandPermission")),
    })).filter((band) => band.level >= 1),
    emailTemplates: [...form.querySelectorAll<HTMLElement>("[data-email-template]")].map((row) => ({
      locale: text(row, "templateLocale") as "fr" | "en" | "es" | "ar",
      purpose: text(row, "templatePurpose") as "po_send" | "po_reminder" | "return_notice",
      subject: text(row, "templateSubject"),
      bodyHtml: text(row, "templateBody"),
    })).filter((row) => row.subject !== "" && row.bodyHtml !== ""),
  }),
  invoice: async (form) => {
    const lines = readInvoiceLines(form);
    if (lines.length === 0) return invalid(form, "[data-invoice-line] [name=description]");
    return actions.purchasing.createInvoice({
      organizationId: org(form),
      kind: (text(form, "kind") || "invoice") as "invoice" | "credit_note",
      title: nullable(text(form, "title")),
      supplierId: text(form, "supplierId"),
      orderId: nullable(text(form, "orderId")),
      supplierInvoiceNumber: nullable(text(form, "supplierInvoiceNumber")),
      currency: text(form, "currency").toUpperCase() || "EUR",
      paymentTermDays: integer(text(form, "paymentTermDays")) ?? 30,
      notes: nullable(text(form, "notes")),
      lines,
    });
  },
  issueInvoice: (form) => actions.purchasing.issueInvoice({ id: form.dataset.id ?? "" }),
  payment: (form) => actions.purchasing.recordPayment({
    id: form.dataset.id ?? "",
    amountMinor: numberField(form, "amountMinor"),
    method: text(form, "method") as "bank_transfer" | "card" | "cash" | "check" | "direct_debit" | "other",
    paidAt: text(form, "paidAt") || undefined,
    reference: nullable(text(form, "reference")),
  }),
  approve: (form) => actions.purchasing.approve({
    id: form.dataset.id ?? "",
    decision: text(form, "decision") as "APPROVED" | "REJECTED",
    comment: nullable(text(form, "comment")),
  }),
  createReturn: (form) => actions.purchasing.createReturn({
    organizationId: org(form),
    supplierId: text(form, "supplierId"),
    warehouseId: text(form, "warehouseId"),
    reason: (text(form, "reason") || "other") as "defective" | "incorrect" | "damaged" | "quality" | "other",
    title: nullable(text(form, "title")),
    notes: nullable(text(form, "notes")),
    lines: [...form.querySelectorAll<HTMLElement>("[data-return-line]")].map((row) => ({
      sku: text(row, "sku"), quantity: integer(text(row, "quantity")) ?? 0,
    })).filter((line) => line.sku !== ""),
  }),
  exportSepa: (form) => {
    const invoiceIds = [...form.querySelectorAll<HTMLInputElement>("[name=invoiceId]:checked")].map((input) => input.value);
    return actions.purchasing.exportSepa({ organizationId: org(form), invoiceIds, requestedExecutionDate: text(form, "requestedExecutionDate") });
  },
  importEinvoice: async (form) => {
    const file = form.querySelector<HTMLInputElement>("[name=file]")?.files?.[0];
    if (!file) return invalid(form, "[name=file]");
    const buffer = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    buffer.forEach((b) => { binary += String.fromCharCode(b); });
    return actions.purchasing.importEinvoice({ organizationId: org(form), filename: file.name, contentBase64: btoa(binary) });
  },
  reorderRule: (form) => actions.purchasing.saveReorderRule({
    organizationId: org(form),
    itemId: text(form, "itemId"),
    warehouseId: text(form, "warehouseId"),
    minQty: numberField(form, "minQty"),
    maxQty: numberField(form, "maxQty"),
    packQty: numberField(form, "packQty") || 1,
    preferredSupplierId: nullable(text(form, "preferredSupplierId")),
    active: checked(form, "active"),
  }),
  runReorder: (form) => actions.purchasing.runReorder({ organizationId: org(form) }),
};


/** Ajout / retrait de lignes répétables (commande, paliers, modèles d'e-mail). */
function bindRepeater(form: HTMLFormElement, opts: { readonly container: string; readonly template: string; readonly row: string; readonly add: string; readonly remove: string; readonly focus?: string; readonly keepLast?: boolean }): void {
  const container = form.querySelector<HTMLElement>(opts.container);
  const template = form.querySelector<HTMLTemplateElement>(opts.template);
  if (!container || !template) return;
  form.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest(opts.add)) {
      container.append(template.content.cloneNode(true));
      if (opts.focus) container.querySelector<HTMLInputElement>(`${opts.row}:last-child ${opts.focus}`)?.focus();
    }
    const remove = target.closest(opts.remove);
    const rows = container.querySelectorAll(opts.row);
    if (remove && (!opts.keepLast || rows.length > 1)) remove.closest(opts.row)?.remove();
  });
}

function bindLines(form: HTMLFormElement): void {
  bindRepeater(form, { container: "[data-lines]", template: "template[data-line-template]", row: "[data-line]", add: "[data-add-line]", remove: "[data-remove-line]", focus: "[name=sku]", keepLast: true });
  bindRepeater(form, { container: "[data-approval-bands]", template: "template[data-band-template]", row: "[data-approval-band]", add: "[data-add-band]", remove: "[data-remove-band]", focus: "[name=bandMinMinor]" });
  bindRepeater(form, { container: "[data-email-templates]", template: "template[data-template-template]", row: "[data-email-template]", add: "[data-add-template]", remove: "[data-remove-template]", focus: "[name=templateSubject]" });
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
