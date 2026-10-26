/** Numérotation des bons de livraison (core/numbering) : sans trou, remise annuelle, attribuée à READY. */
import type { NumberingScheme } from "@/core/numbering";

export const SHIPMENT_NUMBERING_KEY = "logistics.shipment";
export const DEFAULT_SHIPMENT_NUMBERING: NumberingScheme = { pattern: "{prefix}-{YYYY}-{seq:5}", reset: "yearly", prefix: "BL" };
