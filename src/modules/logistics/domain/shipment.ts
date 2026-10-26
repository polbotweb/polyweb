/** Validation d'une expédition : destinataire, pays ISO, lignes (SKU + quantité entière > 0), poids, suivi. */
import { Effect } from "effect";
import { InvalidShipmentError, InvalidWarehouseError } from "./errors";
import { normalizeSku } from "./stock";

export interface ShipmentLineInput { readonly sku: string; readonly description?: string | null; readonly quantity: number }
export interface ShipmentInput {
  readonly recipientName: string;
  readonly country: string;
  readonly weightGrams: number | null;
  readonly trackingNumber: string | null;
  readonly lines: readonly ShipmentLineInput[];
}

export const MAX_LINES = 200;

const isCountry = (value: string) => /^[A-Z]{2}$/.test(value);

export const validateShipmentLines = (lines: readonly ShipmentLineInput[]) =>
  Effect.gen(function* () {
    if (lines.length === 0 || lines.length > MAX_LINES) return yield* new InvalidShipmentError({ field: "lines", value: String(lines.length) });
    return yield* Effect.forEach(lines, (line, index) =>
      Effect.gen(function* () {
        const sku = normalizeSku(line.sku);
        if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(sku)) return yield* new InvalidShipmentError({ field: "sku", value: line.sku });
        if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) return yield* new InvalidShipmentError({ field: "quantity", value: String(line.quantity) });
        return { position: index + 1, sku, description: line.description?.trim() || null, quantity: line.quantity };
      }));
  });

export const validateShipment = (input: ShipmentInput) =>
  Effect.gen(function* () {
    const recipientName = input.recipientName.trim();
    if (recipientName === "" || recipientName.length > 200) return yield* new InvalidShipmentError({ field: "recipient", value: input.recipientName });
    const country = input.country.trim().toUpperCase();
    if (!isCountry(country)) return yield* new InvalidShipmentError({ field: "country", value: input.country });
    if (input.weightGrams !== null && (!Number.isSafeInteger(input.weightGrams) || input.weightGrams < 0)) return yield* new InvalidShipmentError({ field: "weight", value: String(input.weightGrams) });
    const trackingNumber = input.trackingNumber?.trim() || null;
    if (trackingNumber !== null && !/^[A-Za-z0-9 -]{4,64}$/.test(trackingNumber)) return yield* new InvalidShipmentError({ field: "tracking", value: trackingNumber });
    const lines = yield* validateShipmentLines(input.lines);
    return { recipientName, country, weightGrams: input.weightGrams, trackingNumber, lines };
  });

export const totalUnits = (lines: readonly { quantity: number }[]) => lines.reduce((sum, l) => sum + l.quantity, 0);

export const validateWarehouse = (input: { code: string; name: string; country: string | null }) =>
  Effect.gen(function* () {
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{0,15}$/.test(code)) return yield* new InvalidWarehouseError({ field: "code", value: input.code });
    const name = input.name.trim();
    if (name === "" || name.length > 200) return yield* new InvalidWarehouseError({ field: "name", value: input.name });
    const country = input.country?.trim().toUpperCase() || null;
    if (country !== null && !isCountry(country)) return yield* new InvalidWarehouseError({ field: "country", value: input.country ?? "" });
    return { code, name, country };
  });
