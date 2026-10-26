/**
 * Formulaires CRM (opportunité, société, contact, activité) : lecture des champs au format
 * des actions (montants en unités majeures → unités mineures via core/money), appel de
 * l'action `crm.*` désignée par `data-crm-form`, puis redirection ou rechargement.
 */
import { actions } from "astro:actions";
import { Exit, Effect } from "effect";
import { toast } from "@atoms/toast";
import { fromDecimal, isCurrencyCode } from "@/core/money";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const text = (form: ParentNode, name: string) => String(form.querySelector<Field>(`[name="${name}"]`)?.value ?? "").trim();
const nullable = (value: string) => (value === "" ? null : value);

/** Montant saisi (« 12,5 ») → unités mineures, ou `null` si la saisie / la devise est invalide. */
export function amountToMinor(input: string, currency: string): number | null {
  const code = currency.trim().toUpperCase();
  if (!isCurrencyCode(code)) return null;
  const trimmed = input.trim() === "" ? "0" : input.trim().replace(",", ".");
  const exit = Effect.runSyncExit(fromDecimal(trimmed, code));
  return Exit.isSuccess(exit) && exit.value.amountMinor >= 0 ? exit.value.amountMinor : null;
}

export function readOpportunityForm(form: HTMLFormElement) {
  const currency = text(form, "currency").toUpperCase();
  const amountMinor = amountToMinor(text(form, "amount"), currency);
  const probability = text(form, "probability");
  return {
    amountMinor,
    values: {
      title: text(form, "title"), companyId: nullable(text(form, "companyId")), contactId: nullable(text(form, "contactId")),
      amountMinor: amountMinor ?? 0, currency, probability: probability === "" ? null : Number(probability),
      expectedCloseDate: nullable(text(form, "expectedCloseDate")), notes: nullable(text(form, "notes")),
    },
  };
}

export const readCompanyForm = (form: HTMLFormElement) => ({
  name: text(form, "name"), email: nullable(text(form, "email")), phone: nullable(text(form, "phone")), website: nullable(text(form, "website")),
  country: nullable(text(form, "country").toUpperCase()), vatNumber: nullable(text(form, "vatNumber")), address: nullable(text(form, "address")), notes: nullable(text(form, "notes")),
});

export const readContactForm = (form: HTMLFormElement) => ({
  firstName: nullable(text(form, "firstName")), lastName: text(form, "lastName"), email: nullable(text(form, "email")), phone: nullable(text(form, "phone")),
  jobTitle: nullable(text(form, "jobTitle")), companyId: nullable(text(form, "companyId")), notes: nullable(text(form, "notes")),
});

type ActivityKind = "note" | "call" | "email" | "meeting" | "task";
export const readActivityForm = (form: HTMLFormElement) => {
  const dueAt = text(form, "dueAt");
  return {
    kind: (text(form, "kind") || "note") as ActivityKind, subject: text(form, "subject"), body: nullable(text(form, "body")),
    dueAt: dueAt ? new Date(dueAt) : null,
    opportunityId: nullable(form.dataset.opportunityId ?? ""), contactId: nullable(form.dataset.contactId ?? ""), companyId: nullable(form.dataset.companyId ?? ""),
  };
};

const submitters: Record<string, (form: HTMLFormElement) => Promise<{ error?: { message: string }; data?: unknown } | null>> = {
  opportunity: async (form) => {
    const { amountMinor, values } = readOpportunityForm(form);
    if (amountMinor === null) {
      const input = form.querySelector<HTMLInputElement>("[name=amount]");
      input?.setAttribute("aria-invalid", "true");
      input?.focus();
      return null;
    }
    const { id = "", organizationId = "" } = form.dataset;
    return id ? actions.crm.update({ id, ...values }) : actions.crm.create({ ...values, organizationId: organizationId || null });
  },
  company: (form) => {
    const { id = "", organizationId = "" } = form.dataset;
    return id ? actions.crm.updateCompany({ id, ...readCompanyForm(form) }) : actions.crm.createCompany({ ...readCompanyForm(form), organizationId: organizationId || null });
  },
  contact: (form) => {
    const { id = "", organizationId = "" } = form.dataset;
    return id ? actions.crm.updateContact({ id, ...readContactForm(form) }) : actions.crm.createContact({ ...readContactForm(form), organizationId: organizationId || null });
  },
  activity: (form) => actions.crm.createActivity({ ...readActivityForm(form), organizationId: form.dataset.organizationId || null }),
};

export function initCrmForms(): void {
  document.querySelectorAll<HTMLFormElement>("form[data-crm-form]:not([data-bound])").forEach((form) => {
    form.dataset.bound = "true";
    const errorBox = form.querySelector<HTMLElement>("[data-form-error]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (errorBox) errorBox.hidden = true;
      const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
      if (submit) submit.disabled = true;
      const result = await submitters[form.dataset.crmForm ?? ""]?.(form);
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
