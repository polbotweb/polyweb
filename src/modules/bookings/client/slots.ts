/**
 * Créneaux libres dans le formulaire de réservation : `[data-bookings-slots]` appelle
 * `bookings.availability` pour la ressource et la date choisies, affiche un bouton par créneau
 * (heure locale de la ressource) ; un clic renseigne l'heure et la durée du formulaire.
 */
import { actions } from "astro:actions";

const hhmm = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(iso));

export function initBookingsSlots(): void {
  document.querySelectorAll<HTMLElement>("[data-bookings-slots]:not([data-bound])").forEach((root) => {
    root.dataset.bound = "true";
    const form = root.closest("form");
    const list = root.querySelector<HTMLElement>("[data-slot-list]");
    const status = root.querySelector<HTMLElement>("[data-slot-status]");
    if (!form || !list || !status) return;
    root.querySelector<HTMLButtonElement>("[data-show-slots]")?.addEventListener("click", async () => {
      const select = form.querySelector<HTMLSelectElement>("[name=resourceId]");
      const date = form.querySelector<HTMLInputElement>("[name=date]")?.value ?? "";
      if (!select?.value) return select?.focus();
      if (!date) return form.querySelector<HTMLInputElement>("[name=date]")?.focus();
      const zone = select.selectedOptions[0]?.dataset.timezone || "UTC";
      list.replaceChildren();
      const result = await actions.bookings.availability({ resourceId: select.value, date });
      if (result.error) { status.textContent = result.error.message; return; }
      status.textContent = result.data.length === 0 ? (root.dataset.empty ?? "") : "";
      for (const slot of result.data) {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "inline-flex min-h-11 items-center rounded-md border px-3 text-sm";
        button.textContent = `${hhmm(slot.startsAt, zone)}–${hhmm(slot.endsAt, zone)}`;
        button.dataset.slot = slot.startsAt;
        button.addEventListener("click", () => {
          const time = form.querySelector<HTMLInputElement>("[name=time]");
          const duration = form.querySelector<HTMLInputElement>("[name=durationMinutes]");
          if (time) time.value = hhmm(slot.startsAt, zone);
          if (duration) duration.value = String(Math.round((Date.parse(slot.endsAt) - Date.parse(slot.startsAt)) / 60_000));
          list.querySelectorAll("[aria-pressed]").forEach((b) => b.setAttribute("aria-pressed", "false"));
          button.setAttribute("aria-pressed", "true");
        });
        button.setAttribute("aria-pressed", "false");
        li.append(button);
        list.append(li);
      }
    });
  });
}
