/**
 * Socle générique de planification (pur, sans I/O) : intervalles semi-ouverts [start, end),
 * plages hebdomadaires en heure locale d'un fuseau IANA, conversion heure locale ↔ UTC (Intl),
 * et calcul des créneaux libres. Utilisé par le module réservations ; réutilisable ailleurs.
 */

export interface Interval {
  readonly start: Date;
  readonly end: Date;
}

/** Plage hebdomadaire : `weekday` 0 = dimanche … 6 = samedi, heures locales « HH:MM » (fin exclue, `24:00` admis). */
export interface WeeklyWindow {
  readonly weekday: number;
  readonly start: string;
  readonly end: string;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;

export const isTime = (value: string) => HHMM.test(value);
export const timeToMinutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h! * 60 + m!;
};

export const isTimeZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone.length > 0;
  } catch {
    return false;
  }
};

/** Chevauchement d'intervalles semi-ouverts (des créneaux contigus ne se chevauchent pas). */
export const overlaps = (a: Interval, b: Interval) => a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

export const durationMinutes = (interval: Interval) => Math.round((interval.end.getTime() - interval.start.getTime()) / 60_000);

/** Valide une liste de plages (heures valides, début < fin, pas de chevauchement le même jour). */
export const validWindows = (windows: readonly WeeklyWindow[]) =>
  windows.every((w) => Number.isInteger(w.weekday) && w.weekday >= 0 && w.weekday <= 6 && isTime(w.start) && isTime(w.end) && timeToMinutes(w.start) < timeToMinutes(w.end))
  && windows.every((a, i) => windows.every((b, j) => i === j || a.weekday !== b.weekday || timeToMinutes(a.end) <= timeToMinutes(b.start) || timeToMinutes(b.end) <= timeToMinutes(a.start)));

interface LocalParts { readonly year: number; readonly month: number; readonly day: number; readonly hour: number; readonly minute: number; readonly weekday: number }

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Date, heure et jour de semaine locaux d'un instant dans `zone`. */
export const localParts = (instant: Date, zone: string): LocalParts => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short",
  }).formatToParts(instant).map((p) => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), weekday: WEEKDAYS.indexOf(parts.weekday!) };
};

/** Écart (minutes) entre l'heure locale de `zone` et UTC à l'instant donné. */
const offsetMinutes = (instant: Date, zone: string) => {
  const p = localParts(instant, zone);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(instant.getTime() / 60_000) * 60_000) / 60_000);
};

/** Instant UTC d'une date « YYYY-MM-DD » et d'une heure « HH:MM » locales à `zone` (heure inexistante → décalée après le saut DST). */
export const zonedToUtc = (date: string, time: string, zone: string): Date => {
  const [y, mo, d] = date.split("-").map(Number);
  const minutes = timeToMinutes(time);
  const guess = Date.UTC(y!, mo! - 1, d!, 0, minutes);
  const first = guess - offsetMinutes(new Date(guess), zone) * 60_000;
  return new Date(guess - offsetMinutes(new Date(first), zone) * 60_000);
};

/** Date locale « YYYY-MM-DD » d'un instant dans `zone`. */
export const localDate = (instant: Date, zone: string) => {
  const p = localParts(instant, zone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Intervalles UTC d'ouverture pour une date locale donnée. */
export const windowsOn = (date: string, windows: readonly WeeklyWindow[], zone: string): Interval[] => {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return windows.filter((w) => w.weekday === weekday).map((w) => ({
    start: zonedToUtc(date, w.start, zone),
    end: w.end === "24:00" ? zonedToUtc(addDays(date, 1), "00:00", zone) : zonedToUtc(date, w.end, zone),
  })).sort((a, b) => a.start.getTime() - b.start.getTime());
};

/**
 * L'intervalle tient-il dans les plages d'ouverture ? Sans plage définie, la ressource est
 * toujours disponible. Les plages contiguës (ex. 22:00–24:00 puis 00:00–02:00) sont fusionnées.
 */
export const withinWindows = (interval: Interval, windows: readonly WeeklyWindow[], zone: string) => {
  if (windows.length === 0) return true;
  const first = localDate(interval.start, zone);
  const days = Math.min(8, Math.ceil((interval.end.getTime() - interval.start.getTime()) / 86_400_000) + 2);
  const open = Array.from({ length: days }, (_, i) => windowsOn(addDays(first, i - 1), windows, zone)).flat().sort((a, b) => a.start.getTime() - b.start.getTime());
  let cursor = interval.start.getTime();
  for (const w of open) {
    if (w.start.getTime() <= cursor && w.end.getTime() > cursor) cursor = w.end.getTime();
    if (cursor >= interval.end.getTime()) return true;
  }
  return false;
};

/** Créneaux libres de `slotMinutes` sur une date locale, hors intervalles occupés (et hors passé si `notBefore`). */
export const freeSlots = (date: string, windows: readonly WeeklyWindow[], zone: string, busy: readonly Interval[], slotMinutes: number, notBefore?: Date): Interval[] => {
  const step = slotMinutes * 60_000;
  const open = windows.length === 0 ? [{ start: zonedToUtc(date, "00:00", zone), end: zonedToUtc(addDays(date, 1), "00:00", zone) }] : windowsOn(date, windows, zone);
  const slots: Interval[] = [];
  for (const w of open) {
    for (let t = w.start.getTime(); t + step <= w.end.getTime(); t += step) {
      const slot = { start: new Date(t), end: new Date(t + step) };
      if (notBefore && slot.start.getTime() < notBefore.getTime()) continue;
      if (!busy.some((b) => overlaps(slot, b))) slots.push(slot);
    }
  }
  return slots;
};
