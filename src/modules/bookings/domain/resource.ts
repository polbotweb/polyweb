/** Validation des ressources réservables (salle, personne, équipement) et de leurs plages d'ouverture hebdomadaires. */
import { Effect } from "effect";
import { fromDecimal, isCurrencyCode, type CurrencyCode } from "@/core/money";
import { isTimeZone, validWindows, type WeeklyWindow } from "@/core/scheduling";
import { InvalidResourceError } from "./errors";

export const RESOURCE_KINDS = ["room", "staff", "equipment"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export const MAX_WINDOWS = 50;
/** Plafond d'acompte en unités mineures (garde-fou de saisie). */
export const MAX_DEPOSIT_MINOR = 100_000_000;

export interface ResourceFields {
  readonly code: string;
  readonly name: string;
  readonly kind: string;
  readonly capacity: number;
  readonly timezone: string;
  readonly slotMinutes: number;
  readonly windows: readonly WeeklyWindow[];
}

/**
 * Acompte en saisie décimale exacte (« 15 », « 15.50 ») dans une devise ISO 4217 (core/money) ;
 * « 0 » = pas d'acompte. Précision supérieure à la devise refusée.
 */
export const validateDeposit = (amount: string, currency: string) =>
  Effect.gen(function* () {
    const code = currency.trim().toUpperCase();
    if (!isCurrencyCode(code)) return yield* new InvalidResourceError({ field: "deposit", value: currency });
    const money = yield* fromDecimal(amount.trim() || "0", code as CurrencyCode).pipe(Effect.mapError(() => new InvalidResourceError({ field: "deposit", value: amount })));
    if (money.amountMinor < 0 || money.amountMinor > MAX_DEPOSIT_MINOR) return yield* new InvalidResourceError({ field: "deposit", value: amount });
    return { depositMinor: money.amountMinor, depositCurrency: code };
  });

export const validateResource = (input: ResourceFields) =>
  Effect.gen(function* () {
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{0,15}$/.test(code)) return yield* new InvalidResourceError({ field: "code", value: input.code });
    const name = input.name.trim();
    if (name === "" || name.length > 200) return yield* new InvalidResourceError({ field: "name", value: input.name });
    if (!RESOURCE_KINDS.includes(input.kind as ResourceKind)) return yield* new InvalidResourceError({ field: "kind", value: input.kind });
    if (!Number.isSafeInteger(input.capacity) || input.capacity < 1 || input.capacity > 10_000) return yield* new InvalidResourceError({ field: "capacity", value: String(input.capacity) });
    const timezone = input.timezone.trim();
    if (!isTimeZone(timezone)) return yield* new InvalidResourceError({ field: "timezone", value: input.timezone });
    if (![5, 10, 15, 20, 30, 45, 60, 90, 120, 240, 480].includes(input.slotMinutes)) return yield* new InvalidResourceError({ field: "slotMinutes", value: String(input.slotMinutes) });
    if (input.windows.length > MAX_WINDOWS || !validWindows(input.windows)) return yield* new InvalidResourceError({ field: "windows", value: JSON.stringify(input.windows) });
    const windows = [...input.windows].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
    return { code, name, kind: input.kind as ResourceKind, capacity: input.capacity, timezone, slotMinutes: input.slotMinutes, windows };
  });
