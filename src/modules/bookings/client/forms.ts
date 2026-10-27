/**
 * Formulaires bookings (réservation, ressource avec plages d'ouverture) : lecture des champs au
 * format des actions puis appel de l'action `bookings.*` désignée par `data-bookings-form`,
 * puis redirection (fiche) ou rechargement.
 */
import { actions } from "astro:actions";
import { toast } from "@atoms/toast";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type ActionResult = { error?: { message: string }; data?: unknown } | null;

const text = (form: ParentNode, name: string) => String(form.querySelector<Field>(`[name="${name}"]`)?.value ?? "").trim();
const nullable = (value: string) => (value === "" ? null : value);
const integer = (value: string) => (/^\d+$/.test(value) ? Number(value) : null);

const invalid = (form: HTMLFormElement, selector: string): null => {
  const input = form.querySelector<HTMLElement>(selector);
  input?.setAttribute("aria-invalid", "true");
  input?.focus();
  return null;
};

/** Plages `[data-window]` → `{ weekday, start, end }` (lignes incomplètes ignorées). */
export function readWindows(form: ParentNode) {
  return [...form.querySelectorAll<HTMLElement>("[data-window]")]
    .map((row) => ({ weekday: integer(text(row, "weekday")) ?? -1, start: text(row, "start"), end: text(row, "end") }))
    .filter((w) => w.weekday >= 0 && w.start !== "" && w.end !== "");
}

export const readResourceForm = (form: HTMLFormElement) => ({
  code: text(form, "code").toUpperCase(), name: text(form, "name"), kind: text(form, "kind") as "room" | "staff" | "equipment",
  capacity: integer(text(form, "capacity")) ?? 1, timezone: text(form, "timezone") || "UTC", slotMinutes: integer(text(form, "slotMinutes")) ?? 30,
  windows: readWindows(form), active: form.querySelector<HTMLInputElement>("[name=active]")?.checked ?? true,
  deposit: text(form, "deposit") || "0", depositCurrency: (text(form, "depositCurrency") || "EUR").toUpperCase(),
});

export const readBookingForm = (form: HTMLFormElement) => ({
  resourceId: text(form, "resourceId"),
  slot: { date: text(form, "date"), time: text(form, "time"), durationMinutes: integer(text(form, "durationMinutes")) ?? 0 },
  customerName: text(form, "customerName"), customerEmail: nullable(text(form, "customerEmail")),
  partySize: integer(text(form, "partySize")) ?? 1, notes: nullable(text(form, "notes")),
});

const org = (form: HTMLFormElement) => form.dataset.organizationId || null;

const submitters: Record<string, (form: HTMLFormElement) => Promise<ActionResult>> = {
  booking: async (form) => {
    const values = readBookingForm(form);
    if (!values.resourceId) return invalid(form, "[name=resourceId]");
    if (!values.slot.date) return invalid(form, "[name=date]");
    if (!values.slot.time) return invalid(form, "[name=time]");
    if (values.slot.durationMinutes < 5) return invalid(form, "[name=durationMinutes]");
    if (!values.customerName) return invalid(form, "[name=customerName]");
    const id = form.dataset.id ?? "";
    return id ? actions.bookings.update({ id, ...values }) : actions.bookings.create({ ...values, organizationId: org(form) });
  },
  resource: async (form) => {
    const values = readResourceForm(form);
    if (!values.code) return invalid(form, "[name=code]");
    if (!values.name) return invalid(form, "[name=name]");
    const id = form.dataset.id ?? "";
    return id ? actions.bookings.updateResource({ id, ...values }) : actions.bookings.createResource({ ...values, organizationId: org(form) });
  },
};

/** Ajout / retrait de plages d'ouverture (gabarit `template[data-window-template]`). */
function bindWindows(form: HTMLFormElement): void {
  const container = form.querySelector<HTMLElement>("[data-windows]");
  const template = form.querySelector<HTMLTemplateElement>("template[data-window-template]");
  if (!container || !template) return;
  form.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-add-window]")) {
      container.append(template.content.cloneNode(true));
      container.querySelector<HTMLSelectElement>("[data-window]:last-child [name=weekday]")?.focus();
    }
    target.closest("[data-remove-window]")?.closest("[data-window]")?.remove();
  });
}

export function initBookingsForms(): void {
  document.querySelectorAll<HTMLFormElement>("form[data-bookings-form]:not([data-bound])").forEach((form) => {
    form.dataset.bound = "true";
    bindWindows(form);
    const errorBox = form.querySelector<HTMLElement>("[data-form-error]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (errorBox) errorBox.hidden = true;
      form.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
      const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
      if (submit) submit.disabled = true;
      const result = await submitters[form.dataset.bookingsForm ?? ""]?.(form);
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
