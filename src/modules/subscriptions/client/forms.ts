/**
 * Formulaires du back-office subscriptions : `data-subscriptions-form` = plan | price | change,
 * et boutons `data-subscriptions-op` = cancel | resume | price-on | price-off.
 * Erreurs dans `[data-form-error]`, succès : toast puis redirection ou rechargement.
 */
import { actions } from "astro:actions";
import { toast } from "@atoms/toast";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type ActionResult = { error?: { message: string }; data?: unknown } | null;
type Interval = "day" | "week" | "month" | "year";
type TaxCategory = Parameters<typeof actions.subscriptions.createPlan>[0]["taxCategory"];
type SupplyType = Parameters<typeof actions.subscriptions.createPlan>[0]["supplyType"];

const text = (form: ParentNode, name: string) => String(form.querySelector<Field>(`[name="${name}"]`)?.value ?? "").trim();
const nullable = (value: string) => (value === "" ? null : value);
const integer = (value: string, fallback: number) => (/^\d+$/.test(value) ? Number(value) : fallback);
const checked = (form: ParentNode, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked ?? false;

export const readPlanForm = (form: HTMLFormElement) => ({
  slug: text(form, "slug").toLowerCase(), name: text(form, "name"), description: nullable(text(form, "description")),
  taxCategory: (text(form, "taxCategory") || "standard") as TaxCategory, supplyType: (text(form, "supplyType") || "services") as SupplyType,
  active: checked(form, "active"), sortOrder: integer(text(form, "sortOrder"), 0),
});

export const readPriceForm = (form: HTMLFormElement) => ({
  currency: text(form, "currency").toUpperCase(), amount: text(form, "amount"), interval: (text(form, "interval") || "month") as Interval,
  intervalCount: integer(text(form, "intervalCount"), 1), trialDays: integer(text(form, "trialDays"), 0),
});

const submitters: Record<string, (form: HTMLFormElement) => Promise<ActionResult>> = {
  plan: (form) => {
    const id = form.dataset.id ?? "";
    return id ? actions.subscriptions.updatePlan({ id, ...readPlanForm(form) })
      : actions.subscriptions.createPlan({ ...readPlanForm(form), organizationId: form.dataset.organizationId || null });
  },
  price: (form) => actions.subscriptions.createPrice({ planId: form.dataset.id ?? "", ...readPriceForm(form) }),
  change: (form) => actions.subscriptions.changePrice({ id: form.dataset.id ?? "", priceId: text(form, "priceId"), prorate: checked(form, "prorate") }),
};

const showError = (box: HTMLElement | null, message: string) => {
  if (box) { box.textContent = message; box.hidden = false; box.focus(); }
};

function bindForm(form: HTMLFormElement): void {
  const errorBox = form.querySelector<HTMLElement>("[data-form-error]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (errorBox) errorBox.hidden = true;
    const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (submit) submit.disabled = true;
    const result = await submitters[form.dataset.subscriptionsForm ?? ""]?.(form);
    if (submit) submit.disabled = false;
    if (!result) return;
    if (result.error) return showError(errorBox, result.error.message);
    toast.success(form.dataset.done ?? "");
    const created = result.data && typeof result.data === "object" && "id" in result.data ? String(result.data.id) : "";
    const { viewBaseUrl = "", id = "" } = form.dataset;
    window.location.assign(viewBaseUrl ? `${viewBaseUrl}/${id || created}` : window.location.pathname);
  });
}

const operations: Record<string, (id: string) => Promise<ActionResult>> = {
  cancel: (id) => actions.subscriptions.cancel({ id }),
  resume: (id) => actions.subscriptions.resume({ id }),
  "price-on": (id) => actions.subscriptions.setPriceActive({ id, active: true }),
  "price-off": (id) => actions.subscriptions.setPriceActive({ id, active: false }),
};

function bindOperations(root: HTMLElement): void {
  root.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-subscriptions-op]");
    if (!button) return;
    const { subscriptionsOp = "", id = "", confirm: confirmText = "" } = button.dataset;
    const run = operations[subscriptionsOp];
    if (!run || (confirmText && !window.confirm(confirmText))) return;
    button.disabled = true;
    const result = await run(id);
    button.disabled = false;
    if (result?.error) return showError(root.querySelector<HTMLElement>("[data-subscriptions-error]"), result.error.message);
    window.location.assign(window.location.pathname);
  });
}

export function initSubscriptionsForms(): void {
  document.querySelectorAll<HTMLFormElement>("form[data-subscriptions-form]:not([data-bound])").forEach((form) => {
    form.dataset.bound = "true";
    bindForm(form);
  });
  document.querySelectorAll<HTMLElement>("[data-subscriptions-record]:not([data-bound])").forEach((root) => {
    root.dataset.bound = "true";
    bindOperations(root);
  });
}
