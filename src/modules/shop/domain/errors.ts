/** Erreurs de domaine du tunnel de vente (panier, commande, paiement). */
import { Data } from "effect";

export type CartField = "quantity" | "variant" | "currency" | "lines";

export class InvalidCartError extends Data.TaggedError("InvalidCartError")<{ readonly field: CartField; readonly value: string }> {
  override get message() {
    return `Panier invalide (${this.field}) : ${this.value}`;
  }
}

export const CHECKOUT_FIELDS = ["email", "customerName", "phone", "addressLine1", "addressLine2", "postcode", "city", "country", "shippingMethod"] as const;
export type CheckoutField = (typeof CHECKOUT_FIELDS)[number];

/** Saisie du tunnel invalide : liste des champs en erreur (affichés en résumé accessible). */
export class InvalidCheckoutError extends Data.TaggedError("InvalidCheckoutError")<{ readonly fields: readonly CheckoutField[] }> {
  override get message() {
    return `Commande invalide : ${this.fields.join(", ")}`;
  }
}

/** Article indisponible au moment de la réservation (stock ou catalogue). */
export class OutOfStockError extends Data.TaggedError("OutOfStockError")<{ readonly sku: string; readonly available: number; readonly requested: number }> {
  override get message() {
    return `Stock insuffisant pour ${this.sku} : ${this.available} disponible(s), ${this.requested} demandé(s)`;
  }
}

export class OrderTransitionError extends Data.TaggedError("OrderTransitionError")<{ readonly from: string; readonly to: string }> {
  override get message() {
    return `Transition de commande interdite : ${this.from} → ${this.to}`;
  }
}
