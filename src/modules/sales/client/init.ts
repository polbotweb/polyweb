/**
 * Point d'entrée navigateur du domaine sales.
 *
 * Un module client par feature, importé ici. Les composants n'importent QUE ce
 * fichier — jamais `astro:actions` directement — pour que sélecteurs et
 * actions restent regroupés et testables hors rendu.
 */

import { initSalesDocument } from "./document-actions";
import { initSalesDocumentForm } from "./document-form";

/**
 * Branche les comportements d'une page. Idempotent : appelé au premier rendu
 * puis à chaque `astro:after-swap`.
 */
export function initSales(): void {
  initSalesDocumentForm();
  initSalesDocument();
}
